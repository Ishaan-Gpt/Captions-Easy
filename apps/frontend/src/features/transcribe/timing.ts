/**
 * Where the time goes between "drop a video" and "captions on screen". One run = one set of marks; when the run is
 * reported they go to Sentry as a single event (and to the console in development) so each speed-up can be judged
 * against real numbers instead of guesses.
 */
import * as Sentry from "@sentry/nextjs";

export type Mark = "drop" | "probed" | "prepared" | "stored" | "jobCreated" | "audioReady" | "modelReady" | "firstWindow" | "allWindows" | "saved" | "editorShown";

const runs = new Map<string, Partial<Record<Mark, number>>>();
const extras = new Map<string, Record<string, unknown>>();

export function mark(run: string, m: Mark) {
  const r = runs.get(run) ?? {};
  if (r[m] === undefined) r[m] = performance.now();
  runs.set(run, r);
}

export function note(run: string, data: Record<string, unknown>) {
  extras.set(run, { ...extras.get(run), ...data });
}

/** Milliseconds between marks, relative to the first mark. */
export function report(run: string) {
  const r = runs.get(run);
  if (!r) return;
  const first = Math.min(...Object.values(r).filter((v): v is number => typeof v === "number"));
  const rel: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) if (typeof v === "number") rel[k] = Math.round(v - first);
  const info: Record<string, unknown> = {
    ...extras.get(run),
    crossOriginIsolated: typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : false,
    cores: navigator.hardwareConcurrency,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
  if (process.env.NODE_ENV !== "production") console.table({ ...rel, ...info });
  const w = window as unknown as { __captionTimings?: unknown[] };
  (w.__captionTimings ??= []).push({ run, marks: rel, ...info });
  try {
    Sentry.captureMessage("captions timing", { level: "info", tags: { area: "timing", device: String(info.device ?? "?") }, extra: { marks: rel, ...info } });
  } catch { /* telemetry must never break a run */ }
  runs.delete(run);
  extras.delete(run);
}
