import { rmSync } from "node:fs";
import { join } from "node:path";
import anyAscii from "any-ascii";
import type { TranscribeJob } from "@capseasy/shared";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { downloadTo } from "../transfer";
import { extractWav, probe } from "../ffmpeg";
import { ensureModel, ensureWhisperBinary, transcribeWav } from "../whisper";
import { extOf, jobDir, mediaCacheDir, slice, type JobContext } from "./context";

export async function runTranscribe(ctx: JobContext) {
  const { claimed, signal, report } = ctx;
  const job = claimed.job.payload as TranscribeJob;
  const url = claimed.urls.sourceGet;
  if (!url) throw new Error("No source video URL was provided for this job.");

  const source = join(mediaCacheDir(), `${job.videoId}.${extOf(claimed.media?.mime)}`);
  await report("Downloading video", 2);
  await downloadTo(url, source, { signal, onProgress: (f) => void report("Downloading video", slice(2, 15, f)) });

  const dir = jobDir(claimed.job.id);
  const wav = join(dir, "audio.wav");
  try {
    await report("Extracting audio", 16);
    const info = await probe(source);
    if (!info.hasAudio) throw Object.assign(new Error("This video has no audio track to transcribe. Add captions manually or import an SRT."), { code: "NO_AUDIO", retryable: false });
    await extractWav(source, wav, signal);

    await report("Preparing speech model", 22);
    await ensureWhisperBinary();
    await ensureModel(job.model as WhisperModel, (f) => void report("Downloading speech model", slice(22, 32, f)), signal);

    await report("Transcribing", 33);
    const { words, language } = await transcribeWav({
      wavPath: wav,
      model: job.model as WhisperModel,
      language: job.language,
      signal,
      onProgress: (f) => void report("Transcribing", slice(33, 92, f)),
      normalize: {
        durationMs: info.durationMs || undefined,
        romanize: job.romanize ? (t) => anyAscii(t) : undefined,
        vocabulary: job.prompt ? job.prompt.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      },
    });

    await report("Saving captions", 95);
    await ctx.api.complete(claimed.job.id, {
      kind: "transcribe",
      engine: "whisper_cpp",
      model: job.model,
      language: language || "en",
      durationMs: info.durationMs,
      width: info.width,
      height: info.height,
      words,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
