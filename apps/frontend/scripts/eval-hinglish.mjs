// Compares the English speech model with the Hinglish one on a folder of clips: accuracy (word error rate, strict and
// with Hinglish spelling variants forgiven), script (Roman or not), word timings and speed.
//
//   node apps/frontend/scripts/eval-hinglish.mjs <evalset dir> [<local hinglish model dir>] [--dtype q8|fp32]
//
// <evalset dir> holds set.json ([{ id, ref, group, seconds }]) and <id>.f32 files (16 kHz mono float32, raw).
// Without a local model dir the Hinglish model is fetched from its published repo.
import fs from "node:fs";
import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

const [dir, localModel] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// --dtype=q8 (phones / no WebGPU) or --dtype=fp16,q4f16 (encoder,decoder as on WebGPU)
const [encDtype, decDtype = encDtype] = (process.argv.find((a) => a.startsWith("--dtype="))?.split("=")[1] ?? "q8").split(",");
if (!dir) throw new Error("usage: eval-hinglish.mjs <evalset dir> [<local hinglish model dir>]");
// onnxruntime-node can't open models under a path with spaces on Windows: TJS_CACHE moves the download cache
if (process.env.TJS_CACHE) env.cacheDir = process.env.TJS_CACHE;
const set = JSON.parse(fs.readFileSync(path.join(dir, "set.json"), "utf8"));

const MODELS = {
  en: { id: "onnx-community/whisper-base_timestamped", revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e" },
  hinglish: localModel
    ? { id: path.basename(localModel), local: path.dirname(path.resolve(localModel)) }
    : { id: process.env.HINGLISH_MODEL_ID || "captionseasy/whisper-hinglish-swift_timestamped", revision: process.env.HINGLISH_MODEL_REVISION || "main" },
};

const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
/** forgive Hinglish spelling variants: aa/a, ee/i, w/v, z/j, dropped h, nasal n at the end ("hain"/"hai") */
const loose = (w) =>
  w.replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/ph/g, "f").replace(/(?!^)h/g, "")
    .replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/(.)\1+/g, "$1").replace(/([aeiou])n$/, "$1").replace(/y$/, "i");

function wer(ref, hyp) {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return d[ref.length][hyp.length] / Math.max(1, ref.length);
}

async function load(key) {
  const m = MODELS[key];
  if (m.local) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = m.local + path.sep;
  } else {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }
  return pipeline("automatic-speech-recognition", m.id, {
    dtype: { encoder_model: encDtype, decoder_model_merged: decDtype },
    ...(m.revision ? { revision: m.revision } : {}),
  });
}

const results = {};
for (const key of ["en", "hinglish"]) {
  const asr = await load(key);
  // warm-up so the first clip doesn't carry the session start-up cost
  await asr(new Float32Array(16000), { language: "en", task: "transcribe" });
  results[key] = [];
  for (const c of set) {
    const buf = fs.readFileSync(path.join(dir, `${c.id}.f32`));
    const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const t0 = performance.now();
    const out = await asr(audio, { language: "en", task: "transcribe", return_timestamps: "word", max_new_tokens: Math.min(440, Math.ceil(c.seconds * 7) + 20) });
    const ms = performance.now() - t0;
    const chunks = out.chunks ?? [];
    const text = chunks.map((w) => w.text).join("").trim();
    const hyp = words(text);
    const ref = words(c.ref);
    const roman = hyp.length ? hyp.filter((w) => /^[a-z0-9]+$/.test(w)).length / hyp.length : 0;
    // same end cap as the app (speech.ts capWordEnd): a word never outlasts a slow speaker or the audio
    const times = chunks.map((w) => [w.timestamp[0], Math.max(w.timestamp[0] + 0.05, Math.min(w.timestamp[1] ?? w.timestamp[0] + 0.3, w.timestamp[0] + 0.6 + 0.12 * w.text.trim().length, c.seconds))]);
    const monotonic = times.every((t, i) => i === 0 || t[0] >= times[i - 1][0] - 0.01);
    const inRange = times.every((t) => t[0] >= 0 && (t[1] ?? t[0]) <= c.seconds + 0.5);
    results[key].push({ ...c, text, ms, strict: wer(ref, hyp), loose: wer(ref.map(loose), hyp.map(loose)), roman, monotonic, inRange, times, n: hyp.length });
  }
  await asr.dispose();
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log("\n# per clip");
for (let i = 0; i < set.length; i++) {
  const a = results.en[i], b = results.hinglish[i];
  console.log(`\n[${a.group}] ${a.id} (${a.seconds}s)  ref: ${a.ref}`);
  console.log(`  en       ${pct(a.loose).padStart(6)} loose | ${Math.round(a.ms)} ms | ${a.text}`);
  console.log(`  hinglish ${pct(b.loose).padStart(6)} loose | ${Math.round(b.ms)} ms | ${b.text}`);
}

console.log("\n# summary (word error rate: lower is better)");
console.log("group     model     strict   loose   roman   speed(x realtime)   timing ok");
for (const g of [...new Set(set.map((c) => c.group))]) {
  for (const key of ["en", "hinglish"]) {
    const rs = results[key].filter((r) => r.group === g);
    const avg = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    const secs = rs.reduce((s, r) => s + r.seconds, 0), ms = rs.reduce((s, r) => s + r.ms, 0);
    console.log(`${g.padEnd(9)} ${key.padEnd(9)} ${pct(avg((r) => r.strict)).padStart(6)}  ${pct(avg((r) => r.loose)).padStart(6)}  ${pct(avg((r) => r.roman)).padStart(6)}   ${(secs / (ms / 1000)).toFixed(1).padStart(8)}x          ${rs.every((r) => r.monotonic && r.inRange) ? "yes" : "NO"}`);
  }
}

// word timing agreement on English clips: same words, how far apart are their start times?
const diffs = [];
for (let i = 0; i < set.length; i++) {
  if (results.en[i].group !== "en") continue;
  const a = results.en[i], b = results.hinglish[i];
  const n = Math.min(a.times.length, b.times.length);
  for (let k = 0; k < n; k++) diffs.push(Math.abs(a.times[k][0] - b.times[k][0]));
}
if (diffs.length) {
  diffs.sort((x, y) => x - y);
  console.log(`\nword start agreement on English clips: median ${(diffs[diffs.length >> 1] * 1000).toFixed(0)} ms, p90 ${(diffs[Math.floor(diffs.length * 0.9)] * 1000).toFixed(0)} ms`);
}
