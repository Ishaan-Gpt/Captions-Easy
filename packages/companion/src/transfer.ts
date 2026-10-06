import { createWriteStream, existsSync, openAsBlob, renameSync, statSync, unlinkSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Streams to disk (never buffers the whole video in RAM). Skips the download when a same-size cached copy exists. */
export async function downloadTo(url: string, dest: string, opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void; expectedSize?: number } = {}) {
  if (opts.expectedSize && existsSync(dest) && statSync(dest).size === opts.expectedSize) {
    opts.onProgress?.(1);
    return dest;
  }
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let seen = 0;
  const tmp = `${dest}.part`;
  const source = Readable.fromWeb(res.body as never);
  source.on("data", (c: Buffer) => {
    seen += c.length;
    if (total) opts.onProgress?.(Math.min(1, seen / total));
  });
  try {
    await pipeline(source, createWriteStream(tmp), { signal: opts.signal });
    renameSync(tmp, dest);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
  return dest;
}

/** Upload to a Supabase signed-upload URL (multipart, same wire format as supabase-js uploadToSignedUrl). */
export async function uploadSigned(url: string, file: string, contentType: string, signal?: AbortSignal) {
  const blob = await openAsBlob(file, { type: contentType });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", blob, basename(file));
  const res = await fetch(url, { method: "PUT", body: form, headers: { "x-upsert": "true" }, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (HTTP ${res.status}) ${text.slice(0, 200)}`);
  }
}
