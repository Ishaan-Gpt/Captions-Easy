/**
 * The premium caption painter: word-timed two-tier cards on a 2D canvas. Ported from Moovi
 * (packages/library/src/captions/premium/draw.ts @ d4e1133), where Ishaan approved each preset; the CaptionsEasy
 * changes are marked "CaptionsEasy:" (font stacks, the caption box's x/width, one card per page, the shiny highlight
 * without a picture under it, no face box or person matte).
 */
import { fontStack } from '../../fontCatalog';
import type { PremiumPreset, TierSpec } from './presets';

export interface Word { text: string; t: number; end: number }
export interface Card { lead: Word[]; key: Word[]; tail: Word[]; t0: number; t1: number }

const STOP = new Set(('a an the and or but so to of in on at for is are am was be it i we you he she they my your our ' +
  'this that with as by from now just then very really can will do does basically which after before into them get also').split(' '));

/** how strongly a word carries the line: the one the voice hits goes to the key tier */
function weight(w: Word, i: number): number {
  const bare = w.text.replace(/[^\p{L}\p{N}]/gu, '');
  const low = bare.toLowerCase();
  if (!bare) return -9;
  let s = Math.min(bare.length, 9) / 3;
  if (STOP.has(low)) s -= 4;
  if (/\d/.test(bare)) s += 3;
  if (i > 0 && /^\p{Lu}/u.test(bare)) s += 2;
  if (/[!?]$/.test(w.text)) s += 1.5;
  return s;
}

/**
 * Cards: phrases split at punctuation and pauses; the key word is the strongest within `maxWords`. Two tiers
 * (`tailMax` 0): each card ends on its key. Three tiers: the key takes a second strong word ("SOCIAL MEDIA") and up to
 * `tailMax` words after it stay on the card as its tail ("grow karna").
 */
export function cards(words: Word[], maxWords: number, tailMax = 0): Card[] {
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || /[.,!?;:]$/.test(w.text) || next.t - w.end > 0.35) { phrases.push(cur); cur = []; }
  });
  const out: Card[] = [];
  for (let p of phrases) {
    while (p.length) {
      const win = p.slice(0, maxWords);
      // the voice leans on the end of a phrase: a small bias to later words
      const score = (i: number) => weight(win[i]!, i) + (i === p.length - 1 ? 0.6 : 0);
      let k = 0;
      win.forEach((_, i) => { if (score(i) >= score(k)) k = i; });
      if (tailMax > 0) {
        const kEnd = k + 1 < win.length && weight(win[k + 1]!, k + 1) >= 1.5 ? k + 2 : k + 1;
        const end = Math.min(p.length, kEnd + tailMax);
        const seg = p.slice(0, end);
        out.push({ lead: seg.slice(0, k), key: seg.slice(k, kEnd), tail: seg.slice(kEnd), t0: seg[0]!.t, t1: seg[seg.length - 1]!.end });
        p = p.slice(end);
        continue;
      }
      // one short word that closes the phrase rides with the key ("DID IT!")
      const cut = p.length - k - 1 === 1 && p[k + 1]!.text.replace(/\W/g, '').length <= 3 && /[.!?]$/.test(p[k + 1]!.text) ? k + 2 : k + 1;
      const seg = p.slice(0, cut);
      out.push({ lead: seg.slice(0, k), key: seg.slice(k), tail: [], t0: seg[0]!.t, t1: seg[seg.length - 1]!.end });
      p = p.slice(cut);
    }
  }
  // readable time (Ishaan, 2026-10-18: "the minimum appear time was off, appearing too fast and leaving too fast"): a
  // card that would be up for less than MIN_CARD joins its neighbour when the voice runs on (the stronger key leads the
  // merged card), then every card holds until the next one starts, up to HOLD past its last word, never less than MIN_CARD
  const all = (c: Card) => [...c.lead, ...c.key, ...c.tail];
  const span = (c: Card, n?: Card) => (n ? Math.min(n.t0, c.t1 + HOLD) : c.t1 + HOLD) - c.t0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i]!, n = out[i + 1], prev = out[i - 1];
    if (span(c, n) >= MIN_CARD) continue;
    const intoNext = n && n.t0 - c.t1 < 0.6 && all(c).length + all(n).length <= maxWords + 3;
    const intoPrev = !intoNext && prev && c.t0 - prev.t1 < 0.6 && all(prev).length + all(c).length <= maxWords + 3;
    if (!intoNext && !intoPrev) continue;
    const [a, b] = intoNext ? [c, n!] : [prev!, c];
    out.splice(intoNext ? i : i - 1, 2, merged(a, b, tailMax));
    i = Math.max(-1, i - 2);
  }
  out.forEach((c, i) => { const n = out[i + 1]; c.t1 = Math.max(c.t0 + MIN_CARD, n ? Math.min(n.t0, c.t1 + HOLD) : c.t1 + HOLD); if (n) c.t1 = Math.min(c.t1, n.t0); });
  return out;
}

/**
 * CaptionsEasy: the page is the card. The key is the word the creator marked hero, else the strongest word (the same
 * weight and end bias as `cards`); two tiers keep the words after it in the key line, three tiers take a second strong
 * word into the key and leave the rest as the tail.
 */
export function pageCard(words: Word[], tailMax = 0, hero = -1): Card {
  const score = (i: number) => weight(words[i]!, i) + (i === words.length - 1 ? 0.6 : 0);
  let k = hero >= 0 && hero < words.length ? hero : 0;
  if (hero < 0 || hero >= words.length) words.forEach((_, i) => { if (score(i) >= score(k)) k = i; });
  const t0 = words[0]?.t ?? 0, t1 = words[words.length - 1]?.end ?? t0;
  if (tailMax > 0) {
    const kEnd = k + 1 < words.length && weight(words[k + 1]!, k + 1) >= 1.5 ? k + 2 : k + 1;
    return { lead: words.slice(0, k), key: words.slice(k, kEnd), tail: words.slice(kEnd), t0, t1 };
  }
  return { lead: words.slice(0, k), key: words.slice(k), tail: [], t0, t1 };
}

/** shortest time a card stays up, and how long it holds after its last word when the voice pauses */
const MIN_CARD = 1.2, HOLD = 1.0;

/** Two neighbouring cards as one: the stronger key stays the key, the words before it lead, the words after it trail. */
function merged(a: Card, b: Card, tailMax: number): Card {
  const ws = [...a.lead, ...a.key, ...a.tail, ...b.lead, ...b.key, ...b.tail];
  const keyOf = (c: Card) => c.key.reduce((s, w, i) => s + weight(w, i), 0) / Math.max(1, c.key.length);
  const key = keyOf(a) >= keyOf(b) ? a.key : b.key;
  const k0 = ws.indexOf(key[0]!), k1 = k0 + key.length;
  // two tiers end on the key: the words after it ride in the key line
  const tail = tailMax > 0 ? ws.slice(k1) : [];
  return { lead: ws.slice(0, k0), key: tailMax > 0 ? key : ws.slice(k0), tail, t0: ws[0]!.t, t1: ws[ws.length - 1]!.end };
}

/**
 * Captions never show punctuation (Ishaan, 2026-10-18): only letters, digits and the symbols that carry meaning
 * (% $ # & +) reach the screen. The words keep it for timing and key-word choice.
 * CaptionsEasy: an apostrophe or hyphen inside a word is spelling, not punctuation ("I've" never reads "Ive",
 * "editor-thons" never "editorthons"), as in ../../text.ts; so is the separator inside a number ("4,000", "2.5").
 */
export const bare = (s: string) =>
  s.replace(/(?<=\p{L})['’](?=\p{L})/gu, '\u0000').replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, '\u0003')
    .replace(/(?<=\p{N})([,.])(?=\p{N})/gu, (_, c: string) => (c === ',' ? '\u0001' : '\u0002'))
    .replace(/[^\p{L}\p{N}%$#&+ \u0000-\u0003]/gu, '').replace(/\u0000/g, '’').replace(/\u0001/g, ',').replace(/\u0002/g, '.').replace(/\u0003/g, '-');
// CaptionsEasy: the style's title/sentence casings too
const cased = (tier: TierSpec, s: string) => {
  const b = bare(s);
  switch (tier.casing) {
    case 'none': return b;
    case 'lower': return b.toLowerCase();
    case 'title': return b.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
    case 'sentence': return b.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
    default: return b.toUpperCase();
  }
};

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
/** An entry curve that starts and ends at rest, weighted to the start: 1 - (1 - x^1.3)^3 (zero speed at 0 and at 1). */
const fromRest = (x: number) => 1 - Math.pow(1 - Math.pow(clamp(x), 1.3), 3);

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** the font of the last `font()` call, applied as-is to offscreen layers (`ctx.font` reads back without the stretch) */
let face = { font: '', stretch: 'normal', spacing: '0px' };
function setFace(c: Ctx2D) {
  c.font = face.font;
  (c as unknown as { fontStretch: string }).fontStretch = face.stretch;
  (c as unknown as { letterSpacing: string }).letterSpacing = face.spacing;
}

/** cap height as a share of the em, per face; the cap of the last font() call */
const CAPS = new Map<string, number>();
let cap = 0.72;

function font(ctx: CanvasRenderingContext2D, tier: TierSpec, S: number, k = 1): number {
  // the face's own cap height (measured once per face): sizes are cap heights, so any font lands at the same size
  const id = `${tier.italic ? "italic " : ""}${tier.weight} ${fontStack(tier.font)}`;
  if (!CAPS.has(id)) { face = { font: `${tier.italic ? "italic " : ""}${tier.weight} 100px ${fontStack(tier.font)}`, stretch: tier.stretch ?? "normal", spacing: "0px" }; setFace(ctx); const a = ctx.measureText("H").actualBoundingBoxAscent; if (a > 0) CAPS.set(id, a / 100); }
  cap = CAPS.get(id) ?? 0.72;
  const px = (tier.size * S / cap) * k;
  face = { font: `${tier.italic ? "italic " : ""}${tier.weight} ${px}px ${fontStack(tier.font)}`, stretch: tier.stretch ?? 'normal', spacing: `${tier.tracking * px}px` };
  setFace(ctx);
  return px;
}

function fillStyle(ctx: Ctx2D, tier: TierSpec, y: number, px: number): string | CanvasGradient {
  if (typeof tier.fill === 'string') return tier.fill;
  // CaptionsEasy: a creator's gradient runs at its own angle (0 = bottom to top, 90 = left to right) over the word
  const a = ((tier.fillAngle ?? 180) * Math.PI) / 180, cx = px * 1.2, cy = y - px * 0.37;
  const g = tier.fillAngle === undefined ? ctx.createLinearGradient(0, y - px * 0.74, 0, y) : ctx.createLinearGradient(cx - Math.sin(a) * px, cy + Math.cos(a) * px, cx + Math.sin(a) * px, cy - Math.cos(a) * px);
  tier.fill.forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  return g;
}

/**
 * The bloom: the word drawn once into its own layer, then laid back blurred at each radius in screen mode, wide and
 * faint to tight and hot, so the light falls off like a lens bloom instead of stacked shadow rings.
 */
function bloom(ctx: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number, S: number, alpha: number) {
  const g = tier.glow!;
  const pad = Math.ceil(Math.max(...g.layers.map(l => l.r)) * S * 2.5);
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2, h = Math.ceil(px * 1.3) + pad * 2;
  const off = new OffscreenCanvas(w, h);
  const o = off.getContext('2d')!;
  setFace(o);
  o.fillStyle = '#fff'; o.fillText(text, pad, pad + px);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  // each layer carries its own hue (emerald halo, lime body, near-white core): the white mask tinted per layer
  const tint = new OffscreenCanvas(w, h), tc = tint.getContext('2d')!;
  for (const l of g.layers) {
    tc.globalCompositeOperation = 'copy'; tc.drawImage(off, 0, 0);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = l.c ?? g.color; tc.fillRect(0, 0, w, h);
    ctx.globalAlpha = alpha * l.a;
    ctx.filter = `blur(${l.r * S}px)`;
    ctx.drawImage(tint, x - pad, y - px - pad);
  }
  ctx.restore();
}

/** soft corners: the word stroked in its own fill with round joins, so square cuts read as rounded squares */
function round(c: Ctx2D, tier: TierSpec, text: string, x: number, y: number, px: number) {
  if (!tier.round) return;
  c.save(); c.lineJoin = 'round'; c.lineWidth = tier.round * px; c.strokeStyle = c.fillStyle; c.strokeText(text, x, y); c.restore();
}

/**
 * A word as cached sprites (smooth playback): its shadow, its bloom and its face are rasterised once per text, face and
 * size, then every frame only draws them with the word's transform and alpha. Live blur filters and offscreen layers
 * per word per frame dropped playback to 35-45 fps (rAF, measured 2026-10-18).
 */
type Sprite = { shadow: OffscreenCanvas | null; glow: OffscreenCanvas | null; face: OffscreenCanvas; pad: number; px: number };
const SPRITES = new Map<string, Sprite>();
const TIER_KEYS = new WeakMap<TierSpec, string>();
function sprite(tier: TierSpec, text: string, px: number, S: number): Sprite {
  let tk = TIER_KEYS.get(tier);
  if (!tk) { tk = JSON.stringify(tier); TIER_KEYS.set(tier, tk); }
  const key = `${face.font}|${face.stretch}|${face.spacing}|${text}|${Math.round(S)}|${tk}`;
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const glowR = tier.glow ? Math.max(...tier.glow.layers.map(l => l.r)) * S * 2.5 : 0;
  const shadowR = tier.shadow ? (tier.shadow.blur * 2 + Math.abs(tier.shadow.dy)) * S : 0;
  const pad = Math.ceil(Math.max(px * 0.3, glowR, shadowR));
  const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
  setFace(probe);
  const w = Math.ceil(probe.measureText(text).width * (1 + (tier.skew ?? 0)) + px * 0.2) + pad * 2, h = Math.ceil(px * 1.4) + pad * 2;
  const layer = (draw: (o: CanvasRenderingContext2D) => void) => {
    const c = new OffscreenCanvas(w, h), o = c.getContext('2d')!;
    setFace(o);
    draw(o as unknown as CanvasRenderingContext2D);
    return c;
  };
  const out: Sprite = {
    pad, px,
    shadow: tier.shadow ? layer(o => {
      o.shadowColor = tier.shadow!.color; o.shadowBlur = tier.shadow!.blur * S; o.shadowOffsetY = tier.shadow!.dy * S;
      // the letters themselves are pushed out of the layer, only their shadow stays
      o.shadowOffsetX = w * 2; o.fillStyle = '#000'; o.fillText(text, pad - w * 2, pad + px);
    }) : null,
    glow: tier.glow ? layer(o => bloom(o, tier, text, pad, pad + px, px, S, 1)) : null,
    face: layer(o => paintFace(o, tier, text, pad, pad + px, px, S)),
  };
  if (SPRITES.size > 400) SPRITES.clear();
  SPRITES.set(key, out);
  return out;
}

function paintWord(ctx: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number, S: number, alpha: number, glowGain = 1) {
  const sp = sprite(tier, text, px, S);
  const ox = x - sp.pad, oy = y - sp.pad - px;
  ctx.save();
  if (sp.shadow) { ctx.globalAlpha = alpha; ctx.drawImage(sp.shadow, ox, oy); }
  if (sp.glow) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(1, alpha * glowGain); ctx.drawImage(sp.glow, ox, oy); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp.face, ox, oy);
  ctx.restore();
}

/** The word's face (edge, fill, inner sheen) at full opacity, drawn once into its sprite. */
/**
 * The bevel: a lit rim on the top-left of each letter and a dark rim on the bottom-right (the letter minus itself
 * shifted), softened a little, so a flat fill reads as a glossy, cut letter (Premium Caption 4's red).
 */
function bevel(c: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number) {
  const b = tier.bevel;
  if (!b) return;
  const d = Math.max(1, b.size * px);
  const pad = Math.ceil(px * 0.3 + d);
  const w = Math.ceil(c.measureText(text).width) + pad * 2, h = Math.ceil(px * 1.4) + pad * 2;
  for (const [dx, col, a] of [[d, b.light, b.lightA], [-d, b.dark, b.darkA]] as const) {
    const layer = new OffscreenCanvas(w, h), o = layer.getContext('2d')!;
    setFace(o);
    o.fillStyle = col; o.fillText(text, pad, pad + px);
    o.globalCompositeOperation = 'destination-out'; o.fillText(text, pad + dx, pad + px + dx);
    c.save(); c.globalAlpha = a; c.filter = `blur(${d * 0.4}px)`; c.drawImage(layer, x - pad, y - px - pad); c.restore();
  }
}

function paintFace(ctx: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number, S: number) {
  const alpha = 1;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = alpha;
  if (tier.edge) {
    ctx.lineJoin = 'round'; ctx.strokeStyle = tier.edge.color; ctx.lineWidth = tier.edge.width * S / 1080;
    ctx.strokeText(text, x, y);
  }
  if (tier.extrude) {
    // 3D: the letters repeated down and to the right in darkening shades under the face (the reel's glossy red block)
    // one copy per pixel of depth, so the block reads solid (sparse copies showed as stripes)
    const ex = tier.extrude, n = Math.max(ex.steps ?? 10, Math.ceil(ex.depth * px));
    for (let i = n; i >= 1; i--) {
      const k = i / n;
      ctx.fillStyle = k > 0.45 ? ex.dark : ex.color;
      ctx.fillText(text, x + ex.depth * px * k * 0.35, y + ex.depth * px * k);
    }
  }
  if (!tier.sheen) {
    ctx.fillStyle = fillStyle(ctx, tier, y, px);
    round(ctx, tier, text, x, y, px);
    ctx.fillText(text, x, y);
    bevel(ctx, tier, text, x, y, px);
    ctx.restore();
    return;
  }
  // the letters lit from inside: on their own layer, the fill, then their shape blurred white and kept only inside
  // the letters (strongest at the core, falling off to the gradient at the edges)
  const pad = Math.ceil(px * 0.2);
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2, h = Math.ceil(px * 1.3) + pad * 2;
  const layer = new OffscreenCanvas(w, h), o = layer.getContext('2d')!;
  setFace(o);
  const by = pad + px;
  o.fillStyle = fillStyle(o, tier, by, px);
  round(o, tier, text, pad, by, px);
  o.fillText(text, pad, by);
  o.globalCompositeOperation = 'source-atop';
  o.globalAlpha = tier.sheen;
  o.filter = `blur(${px * 0.07}px)`;
  o.fillStyle = '#FFFFFF';
  o.fillText(text, pad, by - px * 0.03);
  ctx.drawImage(layer, x - pad, y - by);
  ctx.restore();
}

/**
 * One tier centred at `cy` (its cap middle). Each word enters on its own onset (`p.enter`, decoded from the reference
 * reel at 30 fps): it pops in large and soft, snaps to size on a damped spring (a small undershoot, the bounce), and its
 * glow flashes on arrival then eases. Words not yet spoken keep their place.
 */
function tierLine(ctx: CanvasRenderingContext2D, p: PremiumPreset, tier: TierSpec, ws: Word[], t: number, W: number, cy: number, S: number) {
  if (!ws.length) return;
  let px = font(ctx, tier, S);
  const text = cased(tier, ws.map(w => w.text).join(' '));
  const k = tier.wide ?? 1;
  const fit = Math.min(1, (W * (p.fitW ?? 0.9)) / (ctx.measureText(text).width * k));
  if (fit < 1) px = font(ctx, tier, S, fit);
  const full = ctx.measureText(text).width * k;
  const base = cy + px * cap / 2;
  const space = ctx.measureText(' ').width * k + (tier.wordGap ?? 0) * px * k;
  let x = (p.x ?? 0.5) * W - full / 2;
  for (const w of ws) {
    const s = cased(tier, w.text);
    const wd = ctx.measureText(s).width * k;
    const e = t - w.t;
    if (e >= 0) {
      const r = p.enter;
      // damped spring 1 - exp(-decay e) cos(freq e): from scaleFrom down through 1, a little under, back to 1
      // a damped spring when it bounces (Caption 1, the reel's measured motion); otherwise one curve that leaves rest
      // and lands at rest (owner rule: speed is a curve, never a step)
      const spring = r.freq > 0 ? 1 - Math.exp(-r.decay * e) * Math.cos(r.freq * e) : fromRest(e * r.decay / 4.6);
      const sc = r.scaleFrom + (1 - r.scaleFrom) * spring;
      const pull = clamp(1 - e / r.blurS);
      const flash = 1 + r.flash * Math.exp(-e / r.flashS);
      ctx.save();
      ctx.translate(x, 0); ctx.scale(k, 1);
      const cx = wd / k / 2, cyw = base - px * cap / 2;
      ctx.translate(cx, cyw); ctx.scale(sc, sc);
      if (tier.skew) ctx.transform(1, 0, -tier.skew, 1, 0, 0);
      ctx.translate(-cx, -cyw);
      // focus pull: the word arrives soft and sharpens as it lands
      if (pull > 0) ctx.filter = `blur(${pull * r.blur * S}px)`;
      paintWord(ctx, tier, s, 0, base, px, S, clamp(e / r.fadeS), flash);
      ctx.restore();
    }
    x += wd + space;
  }
}

/** Paint the caption for time `t` (s) on a W x H canvas. */
/**
 * Paint the caption for time `t` (s) on a W x H canvas that already holds the video frame. `scene.person`: the speaker
 * cut out of the same frame (video masked by a person matte); words of a tier marked `behind` are painted under it.
 * `scene.face`: the face box, which a stack card never covers.
 */
export function drawCaption(ctx: CanvasRenderingContext2D, p: PremiumPreset, list: Card[], t: number, W: number, H: number, scene: Scene = {}) {
  const c = list.find(c => t >= c.t0 && t < c.t1);
  if (c) drawCard(ctx, p, c, t, W, H, scene);
}

/** CaptionsEasy: one card at time `t` (the page is the card; no window check, so a settled card can be painted). */
export function drawCard(ctx: CanvasRenderingContext2D, p: PremiumPreset, c: Card, t: number, W: number, H: number, scene: Scene = {}) {
  if (p.layout === 'stack') return drawStack(ctx, p, c, t, W, H, scene);
  if (p.layout === 'poster') return drawPoster(ctx, p, c, t, W, H, scene);
  const S = Math.min(W, H);
  const [t1, t2] = p.tiers;
  const h1 = c.lead.length ? t1.size * S : 0;
  const h2 = t2.size * S;
  const t3 = p.tiers[2] ?? t1;
  const h3 = c.tail.length ? t3.size * S : 0;
  const gap = c.lead.length ? p.gap * S : 0;
  const gap3 = c.tail.length ? p.gap * S : 0;
  const top = p.y * H - (h1 + gap + h2 + gap3 + h3) / 2;
  // the hold: the whole card settles slowly smaller while it is up (the reference's drift)
  const d = 1 + p.enter.drift * (t - c.t0);
  const cx = (p.x ?? 0.5) * W;
  ctx.save();
  ctx.translate(cx, p.y * H); ctx.scale(d, d); ctx.translate(-cx, -p.y * H);
  tierLine(ctx, p, t1, c.lead, t, W, top + h1 / 2, S);
  tierLine(ctx, p, t2, c.key, t, W, top + h1 + gap + h2 / 2, S);
  tierLine(ctx, p, t3, c.tail, t, W, top + h1 + gap + h2 + gap3 + h3 / 2, S);
  ctx.restore();
}

/** The word onsets that get a Style 1 typing tick (one per word, the owner's rule in sfx-style1/map.json "word"). */
export function ticks(list: Card[]): number[] {
  return list.flatMap(c => [...c.lead, ...c.key, ...c.tail].map(w => w.t));
}

/** Where the speaker is, as shares of the frame (from a face detector and the person matte), for placement. */
export interface Scene {
  face?: { x: number; y: number; w: number; h: number } | null;
  person?: CanvasImageSource | null;
  /**
   * CaptionsEasy: the caption canvas is transparent (the video is another layer), so the shiny highlight samples the
   * picture from `backdrop` (the video frame placed on the W x H frame, in-browser export) or, without one, draws its
   * letters white into `blend`, a canvas shown in CSS difference blend over the video (Player and server render).
   */
  backdrop?: CanvasImageSource | null;
  blend?: CanvasRenderingContext2D | null;
}

/** The anchor of a stack card, read once when the card starts (so the block never jumps while it holds). */
type Anchor = { cx: number; cy: number; span: number; face: { x: number; y: number; w: number; h: number } | null; wmax?: number };
const ANCHORS = new Map<string, Anchor>();

/**
 * The stack (Premium Caption 3, ref c04): the highlighted word is the card. It is scaled to span the speaker's
 * shoulders and centred on the body at shoulder height, behind the speaker (a shiny negative of the frame), the way the
 * reel's "second" crosses behind the neck. Everything else is arranged around it: the words before it above, starting
 * at its left edge (pushed left if they would reach the face), the words after it below, right-aligned to its right
 * edge. Connectors are small, content words a middle size, in clean white Montserrat. Text never covers the face.
 * Each word slides up out of a blur as it is said; the card drifts slowly while it holds.
 */
function drawStack(ctx: CanvasRenderingContext2D, p: PremiumPreset, c: Card, t: number, W: number, H: number, scene: Scene) {
  const S = Math.min(W, H);
  const m = 0.04 * S;
  const [content, key] = p.tiers;
  const connector = p.tiers[2] ?? content;
  const hl = new Set(c.key);
  const isConnector = (w: Word) => { const b = bare(w.text).toLowerCase(); return b.length <= 3 || STOP.has(b); };

  // the anchor: the neck line, from the face box; the highlight spans about 3.2 face boxes, past the shoulders, so the
  // neck and shoulders cut into it but most of the word shows (as the reel's "second" behind the neck)
  const id = `${c.t0}|${W}x${H}|${p.x}|${p.y}|${p.fitW}`;
  let an = ANCHORS.get(id);
  if (!an) {
    const f = scene.face ?? null;
    an = f
      ? { cx: (f.x + f.w / 2) * W, cy: (f.y + f.h) * H - 0.08 * f.h * H, span: Math.min(W - 2 * m, f.w * W * 3.2), face: f }
      : { cx: (p.x ?? 0.5) * W, cy: p.y * H, span: W * Math.min(0.62, p.fitW ?? 0.62), face: null };
    if (ANCHORS.size > 500) ANCHORS.clear();
    ANCHORS.set(id, an);
  }

  type Item = { w: Word; tier: TierSpec; text: string; px: number; cap: number; width: number; k: number };
  const item = (w: Word, k = 1): Item => {
    const tier = hl.has(w) ? key : isConnector(w) ? connector : content;
    const px = font(ctx, tier, S, k);
    const text = cased(tier, w.text);
    return { w, tier, text, px, cap, width: ctx.measureText(text).width, k };
  };
  const gapX = (l: Item) => l.px * (0.24 + (l.tier.wordGap ?? 0));
  const widthOf = (line: Item[]) => line.reduce((a, l, i) => a + l.width + (i ? gapX(l) : 0), 0);
  const capOf = (line: Item[]) => Math.max(0, ...line.map(l => l.px * l.cap));

  // the highlight line, scaled so it spans the shoulders (never past the frame)
  const base = c.key.map(w => item(w));
  const kScale = c.key.length ? Math.max(0.6, Math.min(3, an.span / Math.max(1, widthOf(base)))) : 1;
  const keyLine = c.key.map(w => item(w, kScale));
  const pairs = (ws: Word[]) => { const out: Item[][] = []; for (let i = 0; i < ws.length; i += 2) out.push(ws.slice(i, i + 2).map(w => item(w))); return out; };
  const above = pairs(c.lead), below = pairs(c.tail);
  const lead = p.gap * S;
  const keyW = widthOf(keyLine), keyCap = capOf(keyLine);

  // vertical: the highlight's cap centred on the shoulder line, the rest stacked above and below, all kept in frame
  const aboveH = above.reduce((a, l) => a + capOf(l) + lead, 0), belowH = below.reduce((a, l) => a + lead + capOf(l), 0);
  let keyTop = an.cy - keyCap / 2;
  keyTop = Math.min(keyTop, H - m - belowH - keyCap);
  keyTop = Math.max(keyTop, m + aboveH);
  const keyLeft = Math.min(Math.max(an.cx - keyW / 2, m), W - m - keyW);

  type Placed = { items: Item[]; x: number; base: number };
  const placed: Placed[] = [];
  let y = keyTop - lead;
  for (let i = above.length - 1; i >= 0; i--) {
    const line = above[i]!, w = widthOf(line);
    let x = keyLeft;
    // never into the face: a line that would reach it moves left of it
    const f = an.face;
    if (f && x + w > f.x * W - m && y - capOf(line) < (f.y + f.h) * H + m && y > f.y * H - m) x = Math.max(m, f.x * W - m - w);
    placed.unshift({ items: line, x, base: y });
    y -= capOf(line) + lead;
  }
  if (keyLine.length) placed.push({ items: keyLine, x: keyLeft, base: keyTop + keyCap });
  y = keyTop + keyCap;
  for (const line of below) {
    y += lead + capOf(line);
    placed.push({ items: line, x: Math.max(m, keyLeft + keyW - widthOf(line)), base: y });
  }

  const r = p.enter;
  const drift = 1 + r.drift * (t - c.t0);
  ctx.save();
  ctx.translate(an.cx, an.cy); ctx.scale(drift, drift); ctx.translate(-an.cx, -an.cy);
  const draw = (behind: boolean) => placed.forEach(line => {
    let x = line.x;
    line.items.forEach((l, i) => {
      if (i) x += gapX(l);
      const e = t - l.w.t;
      if (e >= 0 && !!l.tier.behind === behind) {
        const k = fromRest(e / r.blurS);
        const dy = (1 - k) * (r.rise ?? 0.04) * S;
        ctx.save();
        if (k < 1) ctx.filter = `blur(${(1 - k) * r.blur * S}px)`;
        font(ctx, l.tier, S, l.k); // each word in its own face and size (the layout pass left the last one set)
        if (l.tier.shiny) paintShiny(ctx, l.tier, l.text, x, line.base + dy, l.px, S, clamp(e / r.fadeS), scene);
        else paintWord(ctx, l.tier, l.text, x, line.base + dy, l.px, S, clamp(e / r.fadeS));
        ctx.restore();
      }
      x += l.width;
    });
  });
  // the highlight behind the speaker, the speaker over it, the plain words in front
  draw(true);
  if (scene.person && placed.some(l => l.items.some(i => i.tier.behind && t >= i.w.t))) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scene.person, 0, 0, W, H); ctx.restore(); }
  draw(false);
  ctx.restore();
}

/**
 * The poster (Premium Caption 4, ref reel Dd1Mf7xzsbm): the key word is a giant, very tall condensed word standing
 * behind the speaker from the forehead to below the shoulders ("COUNTRIES", "NOBODY"), its letters rising one after
 * another out of a vertical motion trail. The words before it are a small handwritten script tucked on its top-left
 * corner and written on left to right; the words after it are a white sans line over the chest, then the last words in
 * script, right-aligned under the key. Tiers: [script, key, sans]. Text never covers the face.
 */
function drawPoster(ctx: CanvasRenderingContext2D, p: PremiumPreset, c: Card, t: number, W: number, H: number, scene: Scene) {
  const S = Math.min(W, H);
  const m = 0.04 * S;
  const [script, key] = p.tiers;
  const sans = p.tiers[2] ?? script;
  const r = p.enter;

  // the anchor, once per card: centred on the speaker, below the face
  const id = `poster|${c.t0}|${W}x${H}|${p.x}|${p.y}|${p.fitW}`;
  let an = ANCHORS.get(id);
  if (!an) {
    const f = scene.face ?? null;
    an = f
      // like Caption 3 (the look Ishaan approved for text behind the speaker): the key is wider than the shoulders
      // (3.2 face widths) and centred at the neck, so both ends of the word show beside the body and only the neck and
      // shoulders pass in front of it, where the cut-out is solid; across the face, every hole in the matte shows
      ? { cx: (f.x + f.w / 2) * W, cy: (f.y + f.h) * H - 0.08 * f.h * H, span: f.h * H * 0.95, face: f, wmax: Math.min(W - 2 * m, f.w * W * 3.2) }
      // CaptionsEasy (no face box): a shorter key in the caption box, so the giant word sits on the chest, off the face
      : { cx: (p.x ?? 0.5) * W, cy: p.y * H, span: H * 0.17, face: null, wmax: W * (p.fitW ?? 0.86) };
    if (ANCHORS.size > 500) ANCHORS.clear();
    ANCHORS.set(id, an);
  }

  // the key: as wide as the shoulders span (its height capped at about a face), never past the frame
  const keyWords = c.key;
  const keyText = cased(key, keyWords.map(w => w.text).join(' '));
  let kpx = font(ctx, key, S);
  const kw1 = ctx.measureText(keyText).width * (key.wide ?? 1);
  const k0 = Math.max(0.3, Math.min(an.span / (kpx * cap), (an.wmax ?? W - 2 * m) / Math.max(1, kw1)));
  kpx = font(ctx, key, S, k0);
  const kw0 = ctx.measureText(keyText).width * (key.wide ?? 1);
  const kfit = Math.min(1, (W - 2 * m) / kw0, (H - 2 * m) / (kpx * cap));
  if (kfit < 1) kpx = font(ctx, key, S, k0 * kfit);
  const kScale = k0 * Math.min(1, kfit);
  const keyCap = kpx * cap, keyW = ctx.measureText(keyText).width * (key.wide ?? 1);
  const keyLeft = Math.min(Math.max(an.cx - keyW / 2, m), W - m - keyW);
  const keyTop = Math.min(Math.max(an.cy - keyCap / 2, m), H - m - keyCap);
  const keyBase = keyTop + keyCap;

  // the words around it
  // after the key: the first half in white sans over the chest, the rest as closing script ("about working" / "tells you")
  const tail = c.tail;
  const sansWords = tail.slice(0, tail.length >= 2 ? Math.ceil(tail.length / 2) : tail.length);
  const closing = tail.slice(sansWords.length);

  const drift = 1 + r.drift * (t - c.t0);
  ctx.save();
  ctx.translate(an.cx, an.cy); ctx.scale(drift, drift); ctx.translate(-an.cx, -an.cy);

  // 1. the key, behind the speaker: letter by letter out of a vertical trail
  if (keyWords.length && t >= keyWords[0]!.t) {
    font(ctx, key, S, kScale);
    const e = t - keyWords[0]!.t;
    const kw = key.wide ?? 1;
    let x = keyLeft;
    // CaptionsEasy: grapheme clusters, so a Devanagari conjunct rises as one letter
    const chars = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(keyText)].map(g => g.segment) : [...keyText];
    chars.forEach((ch, i) => {
      const cw = ctx.measureText(ch).width * kw;
      const le = e - i * r.stagger!;
      if (le > 0) {
        const k = fromRest(le / r.blurS);
        const dy = (1 - k) * keyCap * (r.rise ?? 0.6);
        ctx.save();
        ctx.translate(x, 0); ctx.scale(kw, 1);
        // the motion trail: faint copies below the letter while it travels, gone when it lands
        if (k < 1) for (const [o, a] of [[0.18, 0.25], [0.36, 0.12]] as const) paintWord(ctx, key, ch, 0, keyBase + dy + o * keyCap * (1 - k), kpx, S, a * (1 - k) * clamp(le / r.fadeS));
        paintWord(ctx, key, ch, 0, keyBase + dy, kpx, S, clamp(le / r.fadeS));
        ctx.restore();
      }
      x += cw;
    });
  }
  // the speaker over it
  if (scene.person && keyWords.length && t >= keyWords[0]!.t) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scene.person, 0, 0, W, H); ctx.restore(); }

  // 2. the script lead, tucked on the key's top-left corner, written on left to right
  const writeOn = (ws: Word[], x: number, base: number, alignRight: boolean) => {
    if (!ws.length) return;
    const px = font(ctx, script, S);
    const text = cased(script, ws.map(w => w.text).join(' '));
    const tw = ctx.measureText(text).width;
    const e = t - ws[0]!.t;
    if (e < 0) return;
    const x0 = alignRight ? x - tw : x;
    const k = fromRest(e / (r.writeS ?? 0.45));
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 - px * 0.3, base - px * 1.4, (tw + px * 0.6) * k, px * 2.2); ctx.clip();
    paintWord(ctx, script, text, x0, base, px, S, 1);
    ctx.restore();
  };
  if (c.lead.length) {
    const spx = font(ctx, script, S);
    let lx = keyLeft + keyW * 0.02;
    const f = an.face;
    // CaptionsEasy: without a face box the key is shorter, so the script rests on its top edge instead of over it
    const lb = f ? keyTop + spx * 0.55 : keyTop + spx * 0.08;
    const lw = ctx.measureText(cased(script, c.lead.map(w => w.text).join(' '))).width;
    // never into the face: move the script left of it when it would reach it
    // never into the face: move the script left of it when it would reach it
    if (f && lx + lw > f.x * W - m && lb > f.y * H - m && lb - spx < (f.y + f.h) * H + m) lx = Math.max(m, f.x * W - m - lw);
    writeOn(c.lead, lx, lb, false);
  }

  // 3. the sans line over the chest (in front), then the closing script, right-aligned under the key
  if (sansWords.length) {
    const px = font(ctx, sans, S);
    const text = cased(sans, sansWords.map(w => w.text).join(' '));
    const tw = ctx.measureText(text).width;
    let x = an.cx - tw / 2;
    // over the chest, never on the face: at least a margin under the face box
    const faceBottom = an.face ? (an.face.y + an.face.h) * H + m + px * cap : 0;
    const base = Math.min(Math.max(keyBase - keyCap * 0.12, faceBottom), H - m);
    let wx = x;
    for (const w of sansWords) {
      font(ctx, sans, S);
      const s = cased(sans, w.text), ww = ctx.measureText(s).width;
      const e = t - w.t;
      if (e >= 0) {
        const k = fromRest(e / 0.25);
        ctx.save();
        if (k < 1) ctx.filter = `blur(${(1 - k) * 0.01 * S}px)`;
        paintWord(ctx, sans, s, wx, base + (1 - k) * 0.02 * S, px, S, clamp(e / 0.12));
        ctx.restore();
      }
      wx += ww + ctx.measureText(' ').width + (sans.wordGap ?? 0) * px;
    }
    x = wx;
  }
  if (closing.length) {
    const spx = font(ctx, script, S);
    const fb = an.face ? (an.face.y + an.face.h) * H + m + spx * 0.9 : 0;
    writeOn(closing, keyLeft + keyW, Math.min(Math.max(keyBase + spx * 0.9, fb), H - m), true);
  }
  ctx.restore();
}

/**
 * The shiny negative (Premium Caption 3's highlight): inside the letters the frame is inverted (difference with
 * white), so the background decides the colour, then saturation and brightness are pushed to the bright side, so the
 * word reads as a shiny, transparent light blue, orange or green depending on what is behind it, with the video's
 * texture still moving inside. A light sheen runs over the top. Flat: no 3D, no perspective.
 */
function paintShiny(ctx: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number, S: number, alpha: number, scene: Scene = {}) {
  const sh = tier.shiny!;
  if (!scene.backdrop && scene.blend) return paintShinyBlend(ctx, scene.blend, tier, text, x, y, px, alpha);
  const m = ctx.getTransform();
  const pad = Math.ceil(px * 0.2);
  const tw = ctx.measureText(text).width;
  // the word's box in canvas pixels (the stack only scales and translates)
  const bx = Math.floor(m.a * (x - pad) + m.e), by = Math.floor(m.d * (y - px - pad) + m.f);
  const bw = Math.ceil(m.a * (tw + pad * 2)), bh = Math.ceil(m.d * (px * 1.35 + pad * 2));
  if (bw < 2 || bh < 2) return;
  const o = new OffscreenCanvas(bw, bh), g = o.getContext('2d')!;
  // 1. the frame under the word, inverted: the background decides the colour
  g.drawImage(scene.backdrop ?? ctx.canvas, bx, by, bw, bh, 0, 0, bw, bh);
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, bw, bh);
  // 2. hue/saturation and brightness on the bright side: shiny, not muddy
  g.globalCompositeOperation = 'copy';
  g.filter = `saturate(${sh.saturate}) brightness(${sh.lift}) contrast(${sh.contrast})`;
  g.drawImage(o, 0, 0);
  g.filter = 'none';
  // 3. the sheen: a light band over the top of the letters
  const sg = g.createLinearGradient(0, pad * m.d, 0, (pad + px) * m.d);
  sg.addColorStop(0, `rgba(255,255,255,${sh.sheen})`); sg.addColorStop(0.5, 'rgba(255,255,255,0.05)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'screen';
  g.fillStyle = sg; g.fillRect(0, 0, bw, bh);
  // 4. kept only inside the letters
  g.globalCompositeOperation = 'destination-in';
  g.setTransform(m.a, 0, 0, m.d, 0, 0);
  setFace(g);
  g.fillStyle = '#FFFFFF';
  g.fillText(text, pad, pad + px);
  g.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha * sh.opacity;
  if (tier.shadow) { ctx.shadowColor = tier.shadow.color; ctx.shadowBlur = tier.shadow.blur * S * m.a; }
  ctx.drawImage(o, bx, by);
  ctx.restore();
}

/**
 * CaptionsEasy: the shiny negative without the picture in hand. The letters go white into the difference-blend layer
 * (white in difference = the frame inverted, so the background still decides the colour); the sheen goes on the
 * normal layer over them. The saturation/brightness push needs the pixels, so it only shows in the in-browser export.
 */
function paintShinyBlend(ctx: CanvasRenderingContext2D, blend: CanvasRenderingContext2D, tier: TierSpec, text: string, x: number, y: number, px: number, alpha: number) {
  const sh = tier.shiny!;
  blend.save();
  blend.setTransform(ctx.getTransform());
  blend.filter = ctx.filter;
  setFace(blend);
  blend.globalAlpha = alpha * sh.opacity;
  blend.fillStyle = '#FFFFFF';
  blend.fillText(text, x, y);
  blend.restore();
  ctx.save();
  const sg = ctx.createLinearGradient(0, y - px, 0, y);
  sg.addColorStop(0, `rgba(255,255,255,${sh.sheen})`); sg.addColorStop(0.5, 'rgba(255,255,255,0.05)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = alpha * sh.opacity;
  ctx.fillStyle = sg;
  ctx.fillText(text, x, y);
  ctx.restore();
}
