import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ClaimedJob, CompanionApi } from "../api";
import { dirs, type Config } from "../config";

export interface JobContext {
  api: CompanionApi;
  cfg: Config;
  claimed: ClaimedJob;
  /** aborted when the user cancels or the lease is lost */
  signal: AbortSignal;
  /** throttled progress + lease heartbeat; throws if the job was cancelled/lost */
  report: (stage: string, percent: number, message?: string) => Promise<void>;
}

export const mediaCacheDir = () => {
  const d = join(dirs.cache, "media");
  mkdirSync(d, { recursive: true });
  return d;
};

export const jobDir = (jobId: string) => {
  const d = join(dirs.cache, "jobs", jobId);
  mkdirSync(d, { recursive: true });
  return d;
};

export const extOf = (mime: string | null | undefined) =>
  ({ "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv" } as Record<string, string>)[mime ?? ""] ?? "mp4";

/** Map a 0..1 fraction of a sub-step onto a slice of the overall percentage bar. */
export const slice = (from: number, to: number, f: number) => Math.round(from + (to - from) * Math.max(0, Math.min(1, f)));
