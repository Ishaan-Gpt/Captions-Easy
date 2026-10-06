import { statfsSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import type { WorkerCapabilities } from "@capseasy/shared";
import { dirs } from "./config";
import { ffmpegPath, run } from "./ffmpeg";
import { installedModels, whisperInstalled } from "./whisper";

export const VERSION = "0.2.0";

export function diskFreeGb(path = dirs.cache): number | undefined {
  try {
    const s = statfsSync(path);
    return Math.round(((s.bavail * s.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    return undefined;
  }
}

export async function hasFfmpeg(): Promise<boolean> {
  try {
    await run(ffmpegPath(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function buildCapabilities(): Promise<WorkerCapabilities> {
  return {
    kinds: ["transcribe", "render", "proxy"],
    whisper: { installed: whisperInstalled(), models: installedModels() },
    cpuCores: cpus().length,
    ramGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    diskFreeGb: diskFreeGb(),
    ffmpeg: await hasFfmpeg(),
  };
}
