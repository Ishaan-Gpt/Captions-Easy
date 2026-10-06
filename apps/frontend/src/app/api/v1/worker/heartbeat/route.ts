import { HeartbeatBody } from "@capseasy/shared";
import { SEEN_WRITE_MS, requireWorker } from "@/lib/api/auth";
import { ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";

/** Below this version a companion ignores `hasWork` / `pollHintMs` and long-polls the claim route instead. */
const SMART_POLL_VERSION = [0, 2, 0];
const atLeast = (v: string | undefined, min: number[]) => {
  const p = (v ?? "0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < min.length; i++) if ((p[i] ?? 0) !== min[i]) return (p[i] ?? 0) > min[i]!;
  return true;
};

/** last full write per worker on this instance: an idle companion doesn't need its row rewritten every call */
const lastWrite = new Map<string, { at: number; jobId: string | null; version?: string }>();

/**
 * Liveness + instructions for a companion. Idle companions are the app's biggest source of requests, so this route
 * does as little as it can: the row is rewritten at most once a minute (or when the job it holds changes), the cancel
 * check only runs while it holds a job, and companions >= 0.2.0 are told whether there is work at all (they only call
 * the claim route when there is) and how long to wait before the next heartbeat.
 */
export const POST = route(async (req: Request) => {
  const worker = await requireWorker(req, { touch: false });
  const body = await parseBody(req, HeartbeatBody);
  const admin = getAdmin();
  const now = Date.now();
  const jobId = body.currentJobId ?? null;
  const prev = lastWrite.get(worker.id);
  const write = !prev || now - prev.at > SEEN_WRITE_MS || prev.jobId !== jobId || prev.version !== body.version;

  const smart = atLeast(body.version, SMART_POLL_VERSION);
  const [, cancelled, queued] = await Promise.all([
    write
      ? admin.from("workers").update({
          status: "online",
          last_seen_at: new Date(now).toISOString(),
          last_error: null,
          ...(body.version ? { version: body.version } : {}),
          ...(body.platform ? { platform: body.platform } : {}),
          ...(body.capabilities ? { capabilities: body.capabilities } : {}),
          current_job_id: jobId,
        }).eq("id", worker.id)
      : null,
    // jobs the user cancelled while this companion is working on them
    jobId ? admin.from("jobs").select("id").eq("worker_id", worker.id).eq("status", "processing").eq("cancel_requested", true) : null,
    // is anything waiting for a computer? (only new companions act on it)
    smart && !jobId
      ? admin.from("jobs").select("id", { count: "exact", head: true })
          .eq("owner_id", worker.ownerId).eq("status", "queued").eq("engine", "local").eq("cancel_requested", false)
          .lte("run_after", new Date(now).toISOString())
      : null,
  ]);
  if (write) {
    if (lastWrite.size > 5000) lastWrite.clear();
    lastWrite.set(worker.id, { at: now, jobId, version: body.version });
  }
  const hasWork = (queued?.count ?? 0) > 0;
  return ok({
    workerId: worker.id,
    minVersion: process.env.COMPANION_MIN_VERSION ?? "0.0.0",
    hasWork,
    // next heartbeat: soon while working or when there's a job to take, otherwise every 90 s
    pollHintMs: jobId ? 15_000 : hasWork ? 1_000 : 90_000,
    cancelJobIds: (cancelled?.data ?? []).map((j) => j.id),
  });
});
