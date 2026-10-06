import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProxyJobSchema } from "@capseasy/shared";
import type { z } from "zod";
import { downloadTo, uploadSigned } from "../transfer";
import { makeProxy, probe } from "../ffmpeg";
import { extOf, jobDir, mediaCacheDir, slice, type JobContext } from "./context";

export async function runProxy(ctx: JobContext) {
  const { claimed, signal, report } = ctx;
  const job = claimed.job.payload as z.infer<typeof ProxyJobSchema>;
  const { sourceGet, previewPut } = claimed.urls;
  if (!sourceGet || !previewPut) throw new Error("Missing URLs for proxy job.");

  const source = join(mediaCacheDir(), `${job.videoId}.${extOf(claimed.media?.mime)}`);
  await report("Downloading video", 3);
  await downloadTo(sourceGet, source, { signal, onProgress: (f) => void report("Downloading video", slice(3, 25, f)) });

  const dir = jobDir(claimed.job.id);
  const out = join(dir, "preview.mp4");
  try {
    const info = await probe(source);
    await makeProxy(source, out, job.targetHeight, info.durationMs, (f) => void report("Creating preview", slice(25, 85, f)), signal);
    if (statSync(out).size === 0) throw new Error("Preview file came out empty.");
    await report("Uploading preview", 88);
    await uploadSigned(previewPut, out, "video/mp4", signal);
    await ctx.api.complete(claimed.job.id, { kind: "proxy", previewPath: "server-computed" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
