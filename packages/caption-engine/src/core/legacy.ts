import { CaptionDocSchema, defaultStyle, newId, type CaptionDoc, type CaptionStyleV2, type Word } from "@capseasy/shared";
import { normalizeTokens } from "./normalize";

/**
 * Legacy transcript_json -> CaptionDoc. Legacy shape (seconds):
 *   { language, words: [{ word, start, end, probability }] }
 * A few older rows used { text, start_ms, end_ms }.
 */
export function legacyTranscriptToDoc(t: unknown): CaptionDoc {
  const src = (t ?? {}) as { language?: string; words?: Record<string, unknown>[] };
  const tokens = (src.words ?? []).map((w) => {
    const text = String((w.word ?? w.text ?? "") as string);
    const startMs = w.start != null ? Number(w.start) * 1000 : Number(w.start_ms ?? w.startMs ?? 0);
    const endMs = w.end != null ? Number(w.end) * 1000 : Number(w.end_ms ?? w.endMs ?? 0);
    const p = (w.probability ?? w.confidence) as number | undefined;
    return { text, startMs, endMs, confidence: typeof p === "number" ? p : undefined, highlighted: w.highlighted === true };
  });
  const highlightedAt = new Set(tokens.filter((t) => t.highlighted).map((t) => Math.round(t.startMs)));
  const words: Word[] = normalizeTokens(tokens).map((w) => ({
    ...w,
    id: w.id || newId(),
    // the old editor's manual highlights become emphasis in the new doc
    ...(highlightedAt.has(w.startMs) ? { emphasis: "strong" as const, source: { ...w.source, emphasis: "user" as const } } : {}),
  }));
  return CaptionDocSchema.parse({ version: 2, language: src.language ?? "en", words });
}

const HIGHLIGHT_MAP: Record<string, CaptionStyleV2["active"]["effect"]> = {
  pop: "pop", flash: "color", underline: "underline", glow: "glow",
};
const ENTRANCE_MAP: Record<string, CaptionStyleV2["entrance"]["type"]> = {
  none: "none", rise: "rise", pop: "pop", fade: "fade", slide: "slide-left", scale: "zoom", rotate: "flip", bounce: "elastic",
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/**
 * Legacy style blob (custom_style_json, a preset typography+highlight object, or the first caption
 * payload of a MotionScript) -> CaptionStyleV2. Unknown/missing keys fall back to defaults.
 */
export function legacyStyleToV2(legacy: unknown, templateId?: string): CaptionStyleV2 {
  const l = (legacy ?? {}) as Record<string, any>;
  const ty = (l.typography ?? l) as Record<string, unknown>;
  const anim = (l.animation ?? {}) as Record<string, unknown>;
  const hl = (l.highlight ?? {}) as { colors?: string[] };
  const box = (l.safe_area ?? l.box) as { top?: number; bottom?: number; left?: number; right?: number } | undefined;

  const yPct = num(ty.y_position_percent);
  const xPct = num(ty.x_position_percent);
  const outline = num(ty.outline) ?? 0;
  const shadow = num(ty.shadow) ?? 0;
  const casing = str(ty.text_transform);

  return defaultStyle({
    templateId: templateId ?? str(l.caption_template) ?? "sentence_highlight",
    fontId: str(ty.font) ?? "Montserrat",
    fontSize: num(ty.size) ?? 64,
    fontWeight: Number(str(ty.weight) ?? ty.weight) || 800,
    casing: casing === "uppercase" ? "upper" : casing === "lowercase" ? "lower" : casing === "capitalize" ? "title" : "none",
    letterSpacing: num(ty.letter_spacing) ?? 0,
    wordSpacing: num(ty.word_spacing) ?? 0,
    lineHeight: num(ty.line_spacing) ? (num(ty.line_spacing) as number) * 1.15 : 1.15,
    align: (str(ty.alignment) as CaptionStyleV2["align"]) ?? "center",
    fill:
      ty.color_mode === "gradient" && str(ty.color2)
        ? { type: "gradient", stops: [{ color: str(ty.color) ?? "#FFFFFF", at: 0 }, { color: str(ty.color2)!, at: 1 }], angle: 135 }
        : { type: "solid", color: str(ty.color) ?? "#FFFFFF" },
    active: {
      effect: HIGHLIGHT_MAP[str(ty.highlight_anim) ?? ""] ?? "pop",
      color: str(l.highlight_color) ?? hl.colors?.[0] ?? "#FFE600",
      scale: 1.08,
      boxRadius: 12,
    },
    stroke: { enabled: outline > 0, width: outline, color: str(ty.outline_color) ?? "#000000" },
    shadows: shadow > 0 ? [{ x: 0, y: shadow, blur: Math.max(2, shadow * 1.4), color: str(ty.shadow_color) ?? "rgba(0,0,0,0.6)" }] : [],
    background: {
      type: ty.background_style === "pill" ? "pill" : ty.background_style === "shadow-box" ? "box" : "none",
      color: "#0C0A06",
      opacity: 0.85,
      padding: 16,
      radius: 16,
      blur: 0,
    },
    position: { x: xPct != null ? xPct / 100 : 0.5, y: yPct != null ? yPct / 100 : 0.72 },
    safeBox: box && box.left != null ? { top: (box.top ?? 80) / 1920, bottom: (box.bottom ?? 120) / 1920, left: (box.left ?? 50) / 1080, right: (box.right ?? 50) / 1080 } : undefined,
    entrance: { type: ENTRANCE_MAP[str(ty.entrance_anim) ?? str(anim.caption_animation) ?? "rise"] ?? "rise", durationMs: 220, stagger: "none", easing: "outExpo" },
  });
}
