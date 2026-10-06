import "server-only";
import type { JobKind, JobPayload } from "@capseasy/shared";
import { getAdmin } from "../supabase/admin";
import { ApiFailure } from "./http";

export interface EnqueueInput {
  ownerId: string;
  projectId: string;
  kind: JobKind;
  payload: JobPayload;
  /** browser = only the user's tab can run it (the desktop helper never claims these) */
  engine?: "local" | "cloud" | "browser";
  priority?: number;
  idempotencyKey?: string;
}

/** Enqueue exactly once: a repeated idempotency key returns the existing job instead of a duplicate. */
export async function enqueueJob(input: EnqueueInput) {
  const admin = getAdmin();
  if (input.idempotencyKey) {
    const { data: existing } = await admin
      .from("jobs").select("*").eq("project_id", input.projectId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (existing) return existing;
  }
  const { data, error } = await admin
    .from("jobs")
    .insert({
      project_id: input.projectId,
      owner_id: input.ownerId,
      job_type: input.kind,
      kind: input.kind,
      status: "queued",
      engine: input.engine ?? "local",
      payload: input.payload,
      priority: input.priority ?? 0,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new ApiFailure("INTERNAL", "Failed to enqueue job", error?.message);
  await logJobEvent(data.id, "queued", 0, `Queued ${input.kind}`);
  return data;
}

export async function logJobEvent(jobId: string, stage: string, progress: number | null, message: string, level = "info", data?: unknown) {
  await getAdmin().from("job_events").insert({ job_id: jobId, stage, progress, message, level, data: data ?? null });
}

/** How long a companion stays "online" after it was last heard from (it writes its liveness at most once a minute). */
export const COMPANION_ONLINE_MS = 3 * 60_000;

/** True when the owner has at least one companion that has been seen recently. */
export async function hasOnlineCompanion(ownerId: string): Promise<boolean> {
  const since = new Date(Date.now() - COMPANION_ONLINE_MS).toISOString();
  const { count } = await getAdmin()
    .from("workers").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).is("revoked_at", null).gte("last_seen_at", since);
  return (count ?? 0) > 0;
}

/** Names of the user's paired (not revoked) computers, most recently seen first. */
export async function pairedComputerNames(ownerId: string): Promise<string[]> {
  const { data } = await getAdmin()
    .from("workers").select("name").eq("owner_id", ownerId).is("revoked_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(5);
  return (data ?? []).map((w) => (w.name as string | null) ?? "your computer");
}

/**
 * Loads a job that the calling worker currently holds. A stale companion (lease expired and the job was
 * re-claimed, cancelled, or finished) gets LEASE_LOST and must drop its work. `allowDone` lets a retried
 * `complete` call succeed idempotently when the same worker already finished the job.
 */
export async function requireHeldJob(jobId: string, workerId: string, opts: { allowDone?: boolean } = {}) {
  const { data } = await getAdmin().from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!data) throw new ApiFailure("NOT_FOUND", "Job not found");
  const mine = data.worker_id === workerId;
  const held = mine && data.status === "processing";
  const doneByMe = opts.allowDone && mine && data.status === "completed";
  if (!held && !doneByMe) throw new ApiFailure("LEASE_LOST", "This job is no longer assigned to this computer");
  return data;
}

export const LEASE_SECONDS = 90;
export const leaseExpiry = () => new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();

/** Recompute the project's coarse status from its jobs (legacy uppercase strings are still read by old UI). */
export async function setProjectStatus(projectId: string, status: "processing" | "ready" | "failed" | "uploaded") {
  await getAdmin().from("projects").update({ status: status.toUpperCase(), updated_at: new Date().toISOString() }).eq("id", projectId);
}
