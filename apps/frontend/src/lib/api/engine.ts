import "server-only";
import { ProjectSettingsSchema, type TranscribeJob } from "@capseasy/shared";
import { getAdmin } from "../supabase/admin";
import { ApiFailure } from "./http";
import { enqueueJob, hasOnlineCompanion, setProjectStatus } from "./jobs";

export type EngineChoice = "auto" | "local" | "cloud";

/**
 * Queue transcription of a video. Captions are made in the user's browser (or by the optional desktop helper);
 * there is no server-side speech-to-text, so "cloud" is refused.
 */
export async function startTranscription(opts: { ownerId: string; projectId: string; videoId: string; requested?: EngineChoice; idempotencyKey: string }) {
  const admin = getAdmin();
  const [{ data: project }, { data: profile }, { data: video }] = await Promise.all([
    admin.from("projects").select("language, settings_json").eq("id", opts.projectId).single(),
    admin.from("profiles").select("preferences").eq("id", opts.ownerId).maybeSingle(),
    admin.from("videos").select("storage_path").eq("id", opts.videoId).single(),
  ]);
  const settings = ProjectSettingsSchema.parse(project?.settings_json ?? {});
  const prefs = (profile?.preferences ?? {}) as { whisper_model?: string; transcription_engine?: EngineChoice };
  if (opts.requested === "cloud") throw new ApiFailure("CONFLICT", "Cloud transcription isn't available. Captions are made in your browser.");
  const online = await hasOnlineCompanion(opts.ownerId);
  const engine = "local" as const;

  const payload: TranscribeJob = {
    kind: "transcribe",
    videoId: opts.videoId,
    engine,
    model: prefs.whisper_model ?? "small",
    language: project?.language && project.language !== "auto" ? project.language : settings.language,
    romanize: settings.romanize,
    prompt: settings.customVocabulary.length ? settings.customVocabulary.join(", ") : undefined,
  };
  // a video that only exists on the user's device can only be transcribed in their browser
  const rowEngine = video?.storage_path.startsWith("local:") ? "browser" : engine;
  const job = await enqueueJob({ ownerId: opts.ownerId, projectId: opts.projectId, kind: "transcribe", payload, engine: rowEngine, idempotencyKey: `${opts.idempotencyKey}:${engine}` });
  await setProjectStatus(opts.projectId, "processing");
  return { jobId: job.id as string, engine, companionOnline: online, cloudAvailable: false };
}
