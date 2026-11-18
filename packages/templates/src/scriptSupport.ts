/**
 * Per-look script support and the card measuring used by layout safety (placement).
 */
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import { getFontEntry } from "./fontCatalog";
import { getLook, getTemplate } from "./registry";
import { scriptSupport, type FontScript, type ScriptSupport } from "./scriptFonts";
import { layoutBox, lineWidth, scaleOf, displayText } from "./text";
import type { Canvas, LookDefinition, MeasureFn, TemplateDefinition } from "./types";

/**
 * THE single source of truth for "this look cannot draw Devanagari": templates that split words into letters / code
 * points (per-letter animation, typewriter reveal, ransom cutouts, letter-by-letter 3D). Devanagari conjuncts and
 * matras break apart there, so they declare Latin only and Devanagari captions should be romanized for them.
 * describeLook().guide.complexScriptSafe / scripts, lookScripts() and recommendLooks all read it.
 * Two render checks keep it honest (scriptSupport.test.tsx): (1) text runs that start with a combining sign or end in
 * a virama (a split inside a syllable), (2) the measured `wholeWords` capability (capabilities.generated.json: a word
 * that never appears as one unbroken run). The list is exactly the union of both. A template may also declare
 * `scripts` itself.
 */
export const LATIN_ONLY_TEMPLATES = new Set<string>([
  // split inside a syllable (check 1)
  "metal_script", "pack_flip_3d", "pack_smooth_fusion", "pack_ransom", "pack_ransom_live", "typewriter",
  // never draw the word as one run (check 2)
  "pack_difference", "pack_track_in", "pack_letter_cascade", "pack_editorial_3d_stack",
]);

export function templateScripts(t: TemplateDefinition): readonly FontScript[] {
  return t.scripts ?? (LATIN_ONLY_TEMPLATES.has(t.id) ? ["latin"] : ["latin", "devanagari"]);
}

const categoryOf = (f: string) => getFontEntry(f)?.category;

/** Script support of a look (by id or definition): native scripts, fallback partner fonts, unsupported scripts. */
export function lookScriptSupport(look: string | LookDefinition): ScriptSupport {
  const def = typeof look === "string" ? getLook(look) : look;
  if (!def) throw new Error(`unknown look ${String(look)}`);
  return styleScriptSupport(def.style);
}

export function styleScriptSupport(style: Pick<CaptionStyleV2, "fontId" | "templateId"> & { hero?: { fontId?: string | null } }): ScriptSupport {
  const t = getTemplate(style.templateId);
  const fonts = [style.fontId, style.hero?.fontId ?? "", ...t.fonts].filter(Boolean) as string[];
  return scriptSupport(fonts, templateScripts(t), categoryOf);
}

/**
 * Approximate on-screen box of a card, in frame fractions, from the template's measuring utilities: the widest line
 * (glyphs + word gaps at the look's size, capped to the caption box width) by the line count x line height, plus
 * the background padding. Layouts with extra ornaments draw a little beyond it: placement keeps a padding margin.
 */
export function measureCardBox(page: Page, style: CaptionStyleV2, canvas: Canvas, measureFn: MeasureFn): { w: number; h: number } {
  const sc = scaleOf(canvas);
  const size = style.fontSize * sc;
  const box = layoutBox(style, canvas);
  const lines = page.lines.length ? page.lines : [page.words];
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, lineWidth(line.map((w) => displayText(w, style)), size, style, sc, measureFn));
  const bg = style.background.type === "none" || style.background.type === "word-box" ? 0 : style.background.padding * sc;
  const w = Math.min(box.width, widest) + bg * 2.8;
  const h = lines.length * size * style.lineHeight + bg * 1.2;
  return { w: Math.min(1, w / canvas.width), h: Math.min(1, h / canvas.height) };
}
