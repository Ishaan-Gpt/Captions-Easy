/**
 * Caption rules calibration: brings every gallery look inside CAPTION_RULES (packages/templates/src/rules.ts) with the
 * smallest change, found by measuring the look live (measure.mjs) and adjusting only:
 *   font size (one factor for the whole look), line width, the caption block's position, the key-word (hero) scale,
 *   and words per card.
 * The look's design (fonts, colours, motion, layout) is never touched. Writes the fixes to
 * packages/templates/src/looks/rules.generated.json, which registry.ts applies; rebuild (pnpm release:build) and run
 * audit.mjs to confirm.
 *
 *   node packages/web/scripts/calibrate.mjs [--looks 12,22] [--dry]
 *
 * It measures the looks as currently built, and the build already applies rules.generated.json, so each run composes
 * its change onto the existing entry (a size factor multiplies; width, position and hero scale replace). Rebuild
 * (node packages/cli/scripts/build.mjs core web) after editing the file and before running this again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCaptions, CAPTION_RULES as R, listLooks, ruleIssues } from "captionseasy";
import { repoDir } from "./harness.mjs";
import { openMeasurer, W } from "./measure.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const dry = process.argv.includes("--dry");
const lookFilter = arg("looks")?.split(",");
const file = join(repoDir, "packages", "templates", "src", "looks", "rules.generated.json");
const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
// hand-made entries ("manual": true, for looks the live measure cannot read) are kept as they are
const fixes = { ...existing };

const m = await openMeasurer({ transcripts: ["talk", "hook"] });
const looks = listLooks().filter((l) => !lookFilter || lookFilter.includes(String(l.number)) || lookFilter.includes(l.id));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const BAND_H = R.lowerBand.y1 - R.lowerBand.y0;
const SAFE_W = R.safe.x1 - R.safe.x0;
/** centred on the frame, text fits x 70-905 when it is at most this wide */
const CENTRED_W = 2 * (R.safe.x1 - W / 2);

for (const l of looks) {
  if (fixes[l.id]?.manual) {
    console.log(`#${l.number} ${l.name}: hand-made fix kept`);
    continue;
  }
  const props = buildCaptions({ words: m.words, look: l.number });
  const s = props.style;
  const orig = { fontSize: s.fontSize, maxWidth: s.maxWidth, position: { ...s.position }, hero: s.hero?.scale, wpc: props.settings.maxWordsPerCard };
  const why = new Set();
  if ((props.settings.maxWordsPerCard ?? 0) > R.maxWordsPerCard) {
    why.add(`${props.settings.maxWordsPerCard} words a card`);
    props.settings.maxWordsPerCard = R.maxWordsPerCard;
  }
  let first = await m.measure(props);
  if (!first) {
    console.log(`#${l.number} ${l.name}: nothing measurable, skipped`);
    continue;
  }
  for (const issue of ruleIssues(first)) why.add(issue);
  const before = ruleIssues(first);
  let cur = first;
  for (let pass = 0; pass < 6 && ruleIssues(cur).length; pass++) {
    // 1) size: one factor for the whole look
    let k = 1;
    if (cur.minSize < R.minTextPx) k = Math.max(k, R.minTextPx / cur.minSize);
    if (cur.maxSize < R.minLeadPx) k = Math.max(k, R.minLeadPx / cur.maxSize);
    if (cur.maxSize * k > R.maxLeadPx) k = R.maxLeadPx / cur.maxSize;
    // 2) hierarchy: shrink the key word when the look draws it at its own scale
    if (cur.ratio > R.maxSizeRatio && s.hero?.scale > 1) {
      s.hero.scale = Math.max(1, s.hero.scale * (R.maxSizeRatio * 0.92) / cur.ratio);
      if (cur.maxSize * k > R.maxLeadPx * 0.9) k = Math.min(k, 1); // the hero shrinks instead
    }
    // 3) width: wrap inside the safe area, centred when possible
    const w = cur.box.x1 - cur.box.x0;
    if (w * k > CENTRED_W) {
      s.maxWidth = Math.min(s.maxWidth ?? 0.86, round((CENTRED_W - 10) / W));
      const fitK = (CENTRED_W - 10) / w;
      // shrink to fit only while the words stay readable; otherwise rely on wrapping
      if (cur.minSize * fitK >= R.minTextPx && cur.maxSize * fitK >= R.minLeadPx) k = Math.min(k, fitK);
    }
    s.fontSize = Math.max(12, Math.min(300, s.fontSize * k));
    cur = await m.measure(props);
    // 4) position: the block sits in the lower band (under a face, above the platform UI) and inside x 70-905
    const h = cur.box.y1 - cur.box.y0;
    let dy = 0;
    if (h <= BAND_H) {
      const y0 = Math.min(Math.max(cur.box.y0, R.lowerBand.y0 + 10), R.lowerBand.y1 - 10 - h);
      dy = y0 - cur.box.y0;
    } else dy = (R.lowerBand.y0 + R.lowerBand.y1) / 2 - (cur.box.y0 + cur.box.y1) / 2;
    let dx = 0;
    const bw = cur.box.x1 - cur.box.x0;
    if (bw <= SAFE_W && (cur.box.x0 < R.safe.x0 || cur.box.x1 > R.safe.x1)) dx = Math.min(Math.max(cur.box.x0, R.safe.x0 + 6), R.safe.x1 - 6 - bw) - cur.box.x0;
    if (Math.abs(dy) > 2 || Math.abs(dx) > 2) {
      s.position = { x: round(Math.min(0.95, Math.max(0.05, s.position.x + dx / W))), y: round(Math.min(0.95, Math.max(0.05, s.position.y + dy / 1920))) };
      cur = await m.measure(props);
    }
  }
  const after = ruleIssues(cur);
  // the build already carries the fixes in rules.generated.json: compose this run's change onto them
  const prev = existing[l.id] ?? {};
  const fix = { ...prev };
  delete fix.why;
  const scale = (prev.fontScale ?? 1) * (s.fontSize / orig.fontSize);
  if (Math.abs(scale - 1) > 0.01) fix.fontScale = round(scale);
  else delete fix.fontScale;
  if (s.maxWidth !== orig.maxWidth) fix.maxWidth = s.maxWidth;
  if (s.position.x !== orig.position.x || s.position.y !== orig.position.y) fix.position = s.position;
  if (s.hero && s.hero.scale !== orig.hero) fix.heroScale = round(s.hero.scale, 2);
  if (props.settings.maxWordsPerCard !== orig.wpc) fix.maxWordsPerCard = props.settings.maxWordsPerCard;
  for (const w of prev.why ?? []) why.add(w);
  if (Object.keys(fix).length) fixes[l.id] = { ...fix, why: [...why] };
  else delete fixes[l.id];
  console.log(`#${l.number} ${l.name}: ${before.length ? before.join("; ") : "ok"}${Object.keys(fix).length ? `\n   fix ${JSON.stringify(fix)}` : ""}${after.length ? `\n   STILL: ${after.join("; ")}` : before.length ? "\n   -> ok" : ""}`);
}
if (!dry) writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(fixes).sort()), null, 2) + "\n");
console.log(`\n${Object.keys(fixes).length} looks need a rules fix${dry ? " (dry run)" : ` -> ${file}`}`);
if (m.errors.length) console.log("page errors:", m.errors.slice(0, 5));
await m.close();
