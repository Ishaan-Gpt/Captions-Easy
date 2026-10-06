import { ProgressBody } from "@capseasy/shared";
import { requireWorker } from "@/lib/api/auth";
import { ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { leaseExpiry, logJobEvent, requireHeldJob } from "@/lib/api/jobs";
import { getAdmin } from "@/lib/supabase/admin";

/** Progress doubles as the lease heartbeat. The reply tells the companion whether the user cancelled. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const worker = await requireWorker(req);
  const { id } = await params;
  const body = await parseBody(req, ProgressBody);
  const job = await requireHeldJob(id, worker.id);

  await getAdmin().from("jobs").update({
    progress: Math.round(body.progress), stage: body.stage, message: body.message ?? null,
    lease_expires_at: leaseExpiry(), updated_at: new Date().toISOString(),
  }).eq("id", id);
  await logJobEvent(id, body.stage, Math.round(body.progress), body.message ?? body.stage);
  return ok({ cancelRequested: job.cancel_requested });
});
