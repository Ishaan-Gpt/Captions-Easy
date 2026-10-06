export interface Rgb { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbToHex = ({ r, g, b }: Rgb) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

function shift(hex: string, amt: number, target: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return rgbToHex({ r: c.r + (target - c.r) * amt, g: c.g + (target - c.g) * amt, b: c.b + (target - c.b) * amt });
}
export const lighten = (hex: string, amt: number) => shift(hex, amt, 255);
export const darken = (hex: string, amt: number) => shift(hex, amt, 0);

export function withAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, alpha))})` : hex;
}

function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio (1..21). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 21;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
