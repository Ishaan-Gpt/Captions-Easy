import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * Readiness: the database answers, and the job queue is alive (claim function present and the pg_cron
 * reaper ran successfully in the last 5 minutes). No Redis/Celery any more: the queue lives in Postgres.
 */
export async function GET() {
  let database = false;
  let queue = false;
  let detail: Record<string, unknown> = {};
  try {
    const admin = getAdmin();
    const { error } = await admin.from("projects").select("id", { head: true, count: "exact" }).limit(1);
    database = !error;
    const { data } = await admin.rpc("queue_health");
    detail = (data ?? {}) as Record<string, unknown>;
    queue = Boolean(detail.claim_fn) && Boolean(detail.reaper_ok);
  } catch {
    /* reported as down below */
  }
  const ready = database && queue;
  return NextResponse.json({ status: ready ? "ready" : "not_ready", checks: { database, queue }, queue: detail }, { status: ready ? 200 : 503 });
}
