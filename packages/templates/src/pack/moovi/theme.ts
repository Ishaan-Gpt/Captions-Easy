/**
 * One accent → the whole lit key line (fill ramp, bloom layers): Premium Caption 1 takes its colour from the video
 * it sits on instead of a fixed green or red. Pure (no DOM), inlined by the gallery and the MP4 path like draw.ts.
 */

type RGB = [number, number, number];

const hex = (c: RGB) => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h: string): RGB => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

function toHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]: RGB): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const WHITE: RGB = [255, 255, 255];

/** The key line lit in `accent`: a top-lit fill ramp and a bloom from a deeper, hue-shifted halo to a near-white core. */
export function litKey(accent: string): { fill: string[]; glow: { color: string; layers: { r: number; a: number; c: string }[] } } {
  const [h, s] = toHsl(rgb(accent));
  // the accent pushed to a lit, saturated mid (any video colour reads as light, not paint)
  const mid = fromHsl([h, Math.max(s, 0.85), 0.56]);
  const deep = fromHsl([h, Math.max(s, 0.9), 0.44]);
  const halo = fromHsl([(h + 345) % 360, 1, 0.46]);
  return {
    fill: [hex(mix(mid, WHITE, 0.75)), hex(mix(mid, WHITE, 0.3)), hex(mid), hex(deep)],
    glow: {
      color: hex(mid),
      layers: [
        { r: 0.06, a: 0.3, c: hex(halo) },
        { r: 0.024, a: 0.45, c: hex(mid) },
        { r: 0.008, a: 0.5, c: hex(mix(mid, WHITE, 0.2)) },
        { r: 0.003, a: 0.4, c: hex(mix(mid, WHITE, 0.7)) },
      ],
    },
  };
}

/**
 * The video's own accent: the strongest saturated hue in a frame's pixels (RGBA), weighted by saturation, lifted to
 * a lit colour. Skin and walls are low-saturation and mostly fall out; null when the frame has no colour to take.
 */
export function accentFromPixels(px: Uint8ClampedArray | Uint8Array): string | null {
  const bins = new Array<number>(24).fill(0), sums = new Array<number>(24).fill(0);
  for (let i = 0; i < px.length; i += 16) {
    const [h, s, l] = toHsl([px[i]!, px[i + 1]!, px[i + 2]!]);
    if (s < 0.4 || l < 0.15 || l > 0.85) continue;
    const b = Math.floor(h / 15) % 24, w = s * s;
    bins[b]! += w; sums[b]! += h * w;
  }
  let best = 0;
  bins.forEach((v, i) => { if (v > bins[best]!) best = i; });
  if (!bins[best]) return null;
  return hex(fromHsl([sums[best]! / bins[best]!, 0.9, 0.56]));
}

/** The key line as metal (Premium Caption 2's gold): a bright top light falling to the accent and a deeper base, no bloom. */
export function metalKey(accent: string): string[] {
  const [h, s] = toHsl(rgb(accent));
  const mid = fromHsl([h, Math.max(s, 0.7), 0.62]);
  const deep = fromHsl([(h + 352) % 360, Math.max(s, 0.75), 0.46]);
  // subtle: the top light only lifts the accent a little (the ref reads as gold, not as white fading to gold)
  return [hex(mix(mid, WHITE, 0.38)), hex(mix(mid, WHITE, 0.14)), hex(mid), hex(deep)];
}

/** A glossy display word (Premium Caption 4's red): a lit top, the accent, a deep base, and the shades of its 3D block. */
export function glossKey(accent: string): { fill: string[]; side: string; dark: string } {
  const [h, s] = toHsl(rgb(accent));
  // deep and saturated (the ref's red reads as lacquer, not salmon): a small lift at the top, a dark base
  const mid = fromHsl([h, Math.max(s, 0.88), 0.44]);
  return {
    fill: [hex(mix(mid, WHITE, 0.1)), hex(mid), hex(fromHsl([h, Math.max(s, 0.9), 0.34]))],
    side: hex(fromHsl([h, Math.max(s, 0.85), 0.22])),
    dark: hex(fromHsl([h, Math.max(s, 0.7), 0.1])),
  };
}
