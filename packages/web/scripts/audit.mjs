/**
 * Caption rules audit: every gallery look rendered live at 1080x1920 with captionseasy-web (measure.mjs) and checked
 * against CAPTION_RULES (packages/templates/src/rules.ts, written up in packages/cli/src/director/SKILL.md):
 * text size, key-word ratio, the Shorts safe area, the face-free lower band and words per card.
 *
 *   node packages/web/scripts/audit.mjs [--looks 12,22] [--out audit.json] [--transcript talk|hook|"your words"]
 *
 * Prints one line per look and exits 1 when a look breaks a rule. Needs packages/web/dist and packages/cli/dist built.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCaptions, CAPTION_RULES, listLooks, ruleIssues } from "captionseasy";
import { openMeasurer } from "./measure.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const out = arg("out") ? resolve(arg("out")) : null;
const lookFilter = arg("looks")?.split(",");

const m = await openMeasurer({ transcripts: arg("transcript") ? [arg("transcript")] : ["talk", "hook"] });
const looks = listLooks().filter((l) => !lookFilter || lookFilter.includes(String(l.number)) || lookFilter.includes(l.id));
const report = [];
let unmeasured = 0;
for (const l of looks) {
  const props = buildCaptions({ words: m.words, look: l.number });
  const r = await m.measure(props);
  const wordsPerCard = props.settings.maxWordsPerCard;
  if (!r) {
    // canvas looks drawn from cached sprites (Premium Caption): sized from their presets, see rules.generated.json
    unmeasured++;
    const issues = wordsPerCard > CAPTION_RULES.maxWordsPerCard ? [`${wordsPerCard} words a card`] : [];
    report.push({ number: l.number, id: l.id, name: l.name, measured: false, wordsPerCard, issues });
    console.log(`#${l.number} ${l.name}: not measurable live (canvas sprites)${issues.length ? "  !! " + issues.join("; ") : ""}`);
    continue;
  }
  const issues = ruleIssues({ ...r, wordsPerCard });
  report.push({ number: l.number, id: l.id, name: l.name, template: props.style.templateId, wordsPerCard, ...r, issues });
  const px = (v) => Math.round(v);
  console.log(`#${l.number} ${l.name} [${props.style.templateId}] ${px(r.minSize)}-${px(r.maxSize)}px x${r.ratio.toFixed(1)} box ${px(r.box.x0)},${px(r.box.y0)}-${px(r.box.x1)},${px(r.box.y1)} ${wordsPerCard}w${issues.length ? "  !! " + issues.join("; ") : ""}`);
}
const failing = report.filter((r) => r.issues.length);
if (out) writeFileSync(out, JSON.stringify({ rules: CAPTION_RULES, transcript: m.words.map((w) => w.text).join(" "), looks: report }, null, 2));
console.log(`\n${failing.length}/${report.length} looks break a caption rule${unmeasured ? ` (${unmeasured} canvas looks checked by their presets only)` : ""}${out ? ` -> ${out}` : ""}`);
if (m.errors.length) console.log("page errors:", m.errors.slice(0, 5));
await m.close();
process.exit(failing.length ? 1 : 0);
