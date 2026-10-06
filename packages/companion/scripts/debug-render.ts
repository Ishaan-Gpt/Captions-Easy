/** Debug helper: render ONE burned-in frame from a local video through the same path the companion uses. */
import { resolve } from "node:path";
import { cpus } from "node:os";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { CaptionDocSchema } from "@capseasy/shared";
import { serveFile } from "../src/media-server";
import { getSite } from "../src/executors/render";

const file = resolve(process.argv[2]!);
const out = resolve(process.argv[3] ?? "debug-frame.png");
const at = Number(process.argv[4] ?? "1.7");

const media = await serveFile(file);
console.log("media server:", media.url);
const head = await fetch(media.url, { headers: { range: "bytes=0-" } });
console.log("range fetch:", head.status, head.headers.get("content-range"), (await head.arrayBuffer()).byteLength, "bytes");

await ensureBrowser();
const serveUrl = await getSite();
const words = ["Stop", "scrolling", "and", "watch", "this", "incredible", "trick"].map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 400, endMs: i * 400 + 380 }));
const inputProps = {
  src: media.url,
  media: { width: 720, height: 1280, fps: 30, durationMs: 6500, rotation: 0 },
  doc: CaptionDocSchema.parse({ version: 2, words }),
  style: { templateId: "sentence_highlight", fontId: "Anton", fontWeight: 900, fontSize: 64, casing: "upper" },
  settings: { maxWordsPerCard: 3 },
  mode: "burn",
};
const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps });
const t0 = Date.now();
if (process.argv[5] === "video") {
  const conc = Number(process.argv[6] ?? Math.max(1, Math.floor(cpus().length / 2)));
  console.log("renderMedia concurrency", conc);
  await renderMedia({ composition, serveUrl, inputProps, codec: "h264", crf: 23, pixelFormat: "yuv420p", outputLocation: out.replace(/\.png$/, ".mp4"), concurrency: conc, frameRange: [0, 89], timeoutInMilliseconds: 60000, onProgress: ({ renderedFrames }) => { if (renderedFrames % 30 === 0) console.log("frames", renderedFrames); } });
  console.log("video ok in", Date.now() - t0, "ms");
  await media.close();
  process.exit(0);
}
await renderStill({ composition, serveUrl, output: out, frame: Math.round(at * 30), inputProps, imageFormat: "png", timeoutInMilliseconds: 60000 });
console.log("still ok in", Date.now() - t0, "ms ->", out);
await media.close();
process.exit(0);
