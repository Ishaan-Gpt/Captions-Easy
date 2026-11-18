/** Small colour maths for theming: parse CSS colours, luminance, saturation, contrast. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  pink: "#ffc0cb", cyan: "#00ffff", magenta: "#ff00ff", gold: "#ffd700", silver: "#c0c0c0", gray: "#808080", grey: "#808080", lime: "#00ff00",
  navy: "#000080", teal: "#008080", maroon: "#800000", olive: "#808000", aqua: "#00ffff", fuchsia: "#ff00ff", violet: "#ee82ee", indigo: "#4b0082",
  coral: "#ff7f50", crimson: "#dc143c", turquoise: "#40e0d0",
};

export function parseColor(input: string | undefined): Rgba | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = NAMED[s] ?? s;
  let m = /^#([0-9a-f]{3,4})$/.exec(hex);
  if (m) {
    const [r, g, b, a] = [...m[1]!].map((c) => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(hex);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a };
  }
  return null;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** WCAG relative luminance 0..1 (unparseable = mid grey) */
export function luminance(c: string | undefined): number {
  const p = parseColor(c);
  if (!p) return 0.5;
  return 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
}
/** HSL saturation 0..1 (how colourful) */
export function saturation(c: string | undefined): number {
  const p = parseColor(c);
  if (!p) return 0;
  const [r, g, b] = [p.r / 255, p.g / 255, p.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}
export const isColourful = (c: string | undefined) => saturation(c) >= 0.25 && luminance(c) > 0.02 && luminance(c) < 0.95;
export const isLight = (c: string | undefined) => luminance(c) >= 0.4;
export function contrast(a: string | undefined, b: string | undefined): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** The candidate that reads best on `bg` (first one wins ties). */
export const mostReadable = (bg: string, candidates: string[]) => candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) + 1e-9 ? c : best), candidates[0]!);
export const sameColour = (a: string | undefined, b: string | undefined) => {
  const p = parseColor(a);
  const q = parseColor(b);
  return !!p && !!q && p.r === q.r && p.g === q.g && p.b === q.b;
};
