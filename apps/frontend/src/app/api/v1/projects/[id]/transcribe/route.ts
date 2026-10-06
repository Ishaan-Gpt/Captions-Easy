import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { startTranscription } from "@/lib/api/engine";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { hasOnlineCompanion } from "@/lib/api/jobs";
import { rateLimit } from "@/lib/api/rateLimit";
import { getAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300; // cloud transcription runs in after()

const Body = z.object({ engine: z.enum(["auto", "local", "cloud"]).default("auto") });

/**
 * (Re)generate captions for the project's latest video. A running job is reused; a job still WAITING for the
 * user's computer can be switched to the cloud by asking for engine "cloud".
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "transcribe", 60, 3600);
  const { id } = await params;
  const raw = await req.text();
  const { engine } = Body.parse(raw ? JSON.parse(raw) : {});

  const { data: project } = await user.db.from("projects").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");
  const { data: video } = await user.db.from("videos").select("id, status").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!video || video.status === "uploading") throw new ApiFailure("CONFLICT", "Upload a video first.");

  const { data: running } = await user.db.from("jobs").select("id, status, engine").eq("project_id", id).eq("kind", "transcribe").in("status", ["queued", "processing"]).limit(1).maybeSingle();
  if (running) {
    const switchToCloud = engine === "cloud" && running.status === "queued" && running.engine === "local";
    if (!switchToCloud) return ok({ jobId: running.id, companionOnline: await hasOnlineCompanion(user.id) });
    await getAdmin().from("jobs").update({ status: "cancelled", finished_at: new Date().toISOString(), error_message: "Switched to cloud transcription" }).eq("id", running.id).eq("status", "queued");
  }

  const r = await startTranscription({ ownerId: user.id, projectId: id, videoId: video.id, requested: engine, idempotencyKey: `transcribe:${video.id}:${Date.now()}` });
  await getAdmin().from("videos").update({ status: "uploaded" }).eq("id", video.id);
  return ok(r, 202);
});
