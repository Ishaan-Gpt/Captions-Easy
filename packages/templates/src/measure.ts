import { measureText } from "@remotion/layout-utils";
import type { MeasureFn } from "./types";

const cache = new Map<string, number>();

/**
 * Real glyph metrics via @remotion/layout-utils (replaces the legacy `len * size * 0.56` guess).
 * Only valid once fonts are loaded (see useFontsReady). Falls back to a rough estimate if measuring
 * is unavailable (e.g. SSR or unit tests without a DOM).
 */
export const measure: MeasureFn = (text, s) => {
  const key = `${s.fontFamily}|${s.fontWeight}|${s.fontStyle ?? ""}|${Math.round(s.fontSize * 10)}|${s.letterSpacing ?? 0}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let w: number;
  try {
    w = measureText({
      text,
      fontFamily: s.fontFamily,
      fontWeight: String(s.fontWeight),
      fontSize: s.fontSize,
      additionalStyles: s.fontStyle && s.fontStyle !== "normal" ? { fontStyle: s.fontStyle } : undefined,
      letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    }).width;
  } catch {
    w = text.length * s.fontSize * 0.56;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, w);
  return w;
};

/** Shrink `size` so `text` fits `maxWidth` (never grows). */
export function fitSize(text: string, size: number, maxWidth: number, spec: Omit<Parameters<MeasureFn>[1], "fontSize">, fn: MeasureFn = measure): number {
  if (!text) return size;
  const w = fn(text, { ...spec, fontSize: size });
  return w > maxWidth ? Math.max(10, size * (maxWidth / w)) : size;
}
