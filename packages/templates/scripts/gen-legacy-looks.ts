/**
 * One-off generator: legacy presets (frontend PRESETS_LIST + backend presets.json) -> CaptionStyleV2 looks.
 * Input:  scripts/legacy-raw.json  (extracted from the old sources)
 * Output: src/looks/legacy.generated.json
 * Run:    pnpm --filter @capseasy/templates gen:legacy
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legacyStyleToV2 } from "@motion-ai/caption-engine/core";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "legacy-raw.json"), "utf8")) as {
  front: Record<string, any>[];
  back: Record<string, any>;
};

// System fonts are not deterministic across machines; swap for Google equivalents.
const FONT_SWAP: Record<string, string> = {
  Georgia: "Libre Baskerville",
  Impact: "Anton",
  Consolas: "JetBrains Mono",
  "Comic Sans MS": "Comic Neue",
};
const swap = (f: string) => FONT_SWAP[f] ?? f;

const CATEGORY: Record<string, string> = {
  hormozi_viral: "Viral", mrbeast_punch: "Viral", cyber_neon: "Tech", tiktok_pop: "Viral", minimal_luxe: "Luxury",
  vintage_cinematic: "Cinematic", bold_impact: "Viral", staggered_splash: "Classic", staggered_classic: "Classic",
  glow_stack_classic: "Classic", serif_pop_classic: "Classic", cartoon_stack_classic: "Classic",
  minimal: "Clean", modern: "Clean", podcast: "Podcast", documentary: "Cinematic", viral_shorts: "Viral",
  educational: "Education", luxury: "Luxury", formal: "Clean", sarcastic: "Fun", humorous_tech: "Tech",
  humorous_non_tech: "Fun", kalakar: "Classic", kalakar_shadow: "Classic",
};

const looks: unknown[] = [];

for (const p of raw.front) {
  const style = legacyStyleToV2({
    caption_template: p.caption_template,
    highlight_color: p.highlight_color,
    font: swap(p.font),
    size: p.size,
    weight: p.weight,
    color: p.color,
    outline: p.outline,
    shadow: p.shadow,
    background_style: p.background_style,
    y_position_percent: p.y_position_percent,
  });
  style.safeBox = {
    top: p.box_top / 1920,
    bottom: p.box_bottom / 1920,
    left: p.box_left / 1080,
    right: p.box_right / 1080,
  };
  looks.push({
    id: p.id,
    name: p.name,
    description: p.desc,
    category: CATEGORY[p.id] ?? "Classic",
    templateId: p.caption_template,
    style,
    settings: { maxWordsPerCard: p.word_limit ?? 4, gapBehavior: p.pause_handling === "clear" ? "clear" : "hold" },
    legacy: true,
  });
}

for (const [key, v] of Object.entries(raw.back)) {
  const id = key.replace(/\s+/g, "_");
  const ty = { ...v.typography, font: swap(v.typography.font) };
  const templateId = v.timing?.caption_template ?? "sentence_highlight";
  const style = legacyStyleToV2({ ...ty, typography: ty, animation: v.animation, highlight: v.highlight, safe_area: v.safe_area, caption_template: templateId }, templateId);
  looks.push({
    id,
    name: v.name ?? key,
    description: `${v.name ?? key} style preset`,
    category: CATEGORY[id] ?? "Classic",
    templateId,
    style,
    settings: { maxWordsPerCard: v.timing?.word_limit ?? 4, gapBehavior: v.timing?.pause_handling === "clear" ? "clear" : "hold" },
    legacy: true,
  });
}

writeFileSync(join(here, "../src/looks/legacy.generated.json"), JSON.stringify(looks, null, 1));
console.log(`wrote ${looks.length} legacy looks`);
