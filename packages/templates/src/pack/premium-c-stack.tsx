/**
 * Editorial 3D Stack: the card is set as an editorial type lockup that is built in depth, line by line, as it is spoken.
 *
 * The lockup. Every word gets a role, deterministically: the key words (the creator's hero/strong emphasis, else the
 * card's key word, plus a short word leading into it, "A YEAR") are heavy caps in the highlight colour with a warm
 * glow; small function words (the, a, of, to, I, then, for, how, ...) are a light serif, lower case as spoken; every
 * other word is a heavy white cap. Runs of serif words make their own small line, and a pair of them is spread to the
 * lockup's edges ("then ........ I"); a lone serif word sits on the baseline beside its heavy word ("the LIBRARIES").
 * Heavy lines grow (up to 1.45x) toward a common measure, so the block reads justified, and the leading is negative:
 * each line overlaps the one before it. Cards alternate right- and left-aligned (by card index) and hug that side.
 *
 * The depth. The lockup is a plane in 3D, tilted toward the frame centre (rotateY about 8 deg, rotateX 5 deg) and seen
 * through a perspective camera: every letter's position, size and keystone skew are projected per letter. Each line
 * that lands pushes the lines before it back in z (they recede, shrink toward the vanishing point and dim), so a new
 * line always lands IN FRONT of, and overlapping, the last one; the group shadow under each word shades the line
 * behind it. A camera re-frames the lockup as it grows: it starts close on the first line, then pulls back (log space)
 * and re-centres on the lines that have arrived, while the plane orbits from almost frontal to its full tilt.
 *
 * The motion. Letters fly in one by one from below and out of depth (seeded scatter, a little rotation), on a spring
 * with a small overshoot, stretched along their path and blurred by their own projected speed (180 deg shutter). A key
 * word's glow ignites with a short deterministic flicker as it lands and it gives a small punch when spoken. The card
 * leaves by blurring and scaling toward the camera.
 *
 * Exporter notes (@remotion/web-renderer): the 3D is projected in code, so EVERY element stays 2D (no WebGL pass,
 * no nested 3D, no `perspective` anywhere). Shadows and glows are drop-shadow filters on each word group, never
 * text-shadows on moving letters (the exporter draws a text-shadow once per layer, so blurred/fading letters would
 * come out heavier); the exporter precomposes a filtered group over the union of its descendants' boxes, so flying
 * letters are never cropped. Back-line dimming is a brightness() in the same group filter. Pure in `timeMs`.
 */
import React from "react";
import type { Word } from "@capseasy/shared";
import { displayText } from "../text";
import type { PageRenderProps } from "../types";
import { cardOrdinal, hash, keyWordIndex, rand, withAlpha } from "./kit";
import { FRAME, Ink, type Face, faceCss, glyphsOf, gradientImage, mixHex, strokeCss } from "./premium-a-kit";
import { AE, Frame, appearAt, clamp, clamp01, ctxOf, exitWindow, impulse, lerp, px, smoothstep, spring } from "./premium-b-kit";

export const STACK_SERIF = "Instrument Serif";

type Role = "key" | "heavy" | "serif";

/** connector words set in the light serif */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "of", "to", "i", "then", "for", "how", "and", "or", "so", "in", "on", "at", "by", "with", "from", "it", "is", "was", "be", "as",
  "if", "that", "this", "my", "your", "you", "we", "me", "our", "just", "like", "can", "into", "over", "out", "up", "its", "it's", "are", "were",
  "do", "did", "has", "have", "had", "i'm", "but", "when", "what", "there", "their", "they", "he", "she", "his", "her", "them", "us", "about", "all",
  "be", "been", "being", "than", "too", "very", "yet", "will", "would", "could", "should", "where", "which", "who", "why", "know", "you're", "we're",
]);
const norm = (t: string) => t.toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}']/gu, "");
const letters = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "").length;

// ------------------------------------------------------------------------------------------- type metrics (em)
/** heavy caps: cap height above the baseline; serif: ascender above / tuck below the baseline */
const CAP_EM = 0.72;
const SERIF_ASC_EM = 0.64;
const SERIF_DESC_EM = 0.06;
/** where the baseline sits in a line-height:1 box (Archivo Black-like grotesk / Instrument Serif) */
const HEAVY_BL_EM = 0.84;
const SERIF_BL_EM = 0.8;
/** serif words are set at this share of the heavy size beside them */
const SERIF_K = 0.8;
const MAX_GROW = 1.45;
const KEY_K = 1.2;
const MIN_BLOCK_EM = 5.2;
const GAP_EM = 0.22;

// ------------------------------------------------------------------------------------------- the camera
/** perspective distance as a multiple of the lockup width */
const PERSPECTIVE_W = 2.1;
const TILT_Y = 13;
const TILT_X = 7;
/** how far back (in z, share of the perspective distance) a line moves for each line that lands in front of it */
const Z_STEP = 0.11;
const LINE_IN_MS = 520;

interface LWord {
  w: Word;
  i: number;
  role: Role;
  text: string;
  face: Face;
  size: number;
  width: number;
  /** left edge and baseline in lockup coordinates (top-left origin), px */
  x: number;
  baseline: number;
}
interface LLine {
  words: LWord[];
  start: number;
  top: number;
  bottom: number;
}

/** deterministic role per word */
function rolesOf(words: Word[], keyI: number): Role[] {
  const roles: Role[] = words.map((w, i) => {
    if (w.emphasis === "hero" || w.emphasis === "strong") return "key";
    if (i === keyI && !FUNCTION_WORDS.has(norm(w.text))) return "key";
    return FUNCTION_WORDS.has(norm(w.text)) ? "serif" : "heavy";
  });
  // a card of connector words still needs a heavy word: its longest word
  if (!roles.some((r) => r !== "serif")) {
    let best = 0;
    words.forEach((w, i) => {
      if (letters(w.text) > letters(words[best]!.text)) best = i;
    });
    roles[best] = "key";
  }
  return roles;
}

/** lines of word indices, in spoken order */
function linesOf(words: Word[], roles: Role[]): number[][] {
  const lines: number[][] = [];
  let i = 0;
  const n = words.length;
  while (i < n) {
    if (roles[i] === "serif") {
      let j = i;
      while (j < n && roles[j] === "serif") j++;
      const run = Array.from({ length: j - i }, (_, k) => i + k);
      if (run.length === 1) {
        // a lone connector rides on the baseline of its heavy word: before the next one, or after the last one
        if (j < n) {
          lines.push(...packHeavy([i], words, roles, j));
          i = lines.length ? lastEnd(lines) : j;
          continue;
        }
        if (lines.length && roles[lines[lines.length - 1]!.slice(-1)[0]!] !== "serif") lines[lines.length - 1]!.push(i);
        else lines.push(run);
      } else {
        // pairs, spread to the lockup's edges ("then ...... I"); a leftover word leads into the next heavy word
        const pairs: number[][] = [];
        for (let k = 0; k < run.length; k += 2) pairs.push(run.slice(k, k + 2));
        const tail = pairs[pairs.length - 1]!;
        if (tail.length === 1 && j < n) {
          lines.push(...pairs.slice(0, -1));
          lines.push(...packHeavy(tail, words, roles, j));
          i = lastEnd(lines);
          continue;
        }
        if (tail.length === 1 && pairs.length > 1) pairs[pairs.length - 2]!.push(...pairs.pop()!);
        lines.push(...pairs);
      }
      i = j;
    } else {
      lines.push(...packHeavy([], words, roles, i));
      i = lastEnd(lines);
    }
  }
  // at most five lines: merge the shortest neighbouring pair of the same kind (else any pair)
  while (lines.length > 5) {
    let best = 0;
    let bestLen = Infinity;
    for (let k = 0; k + 1 < lines.length; k++) {
      const len = [...lines[k]!, ...lines[k + 1]!].reduce((a, x) => a + letters(words[x]!.text), 0);
      if (len < bestLen) {
        bestLen = len;
        best = k;
      }
    }
    lines.splice(best, 2, [...lines[best]!, ...lines[best + 1]!]);
  }
  return lines;
}
/** a colour with its alpha scaled (#hex or rgba()) */
const fade = (c: string, a: number) => {
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (!m) return withAlpha(c, a);
  const p = m[1]!.split(",").map((x) => x.trim());
  return `rgba(${p[0]},${p[1]},${p[2]},${((p[3] === undefined ? 1 : Number(p[3])) * a).toFixed(3)})`;
};
const lastEnd = (lines: number[][]) => lines[lines.length - 1]!.slice(-1)[0]! + 1;

/** one heavy run from `from`, packed into lines (a key word gets its own line; a short word may lead into it) */
function packHeavy(prefix: number[], words: Word[], roles: Role[], from: number): number[][] {
  const out: number[][] = [];
  let cur: number[] = [...prefix];
  let curLen = 0;
  let k = from;
  const n = words.length;
  while (k < n && roles[k] !== "serif") {
    const len = letters(words[k]!.text);
    const heavyInCur = cur.filter((x) => roles[x] !== "serif");
    const curHasKey = heavyInCur.some((x) => roles[x] === "key");
    const leadIn = heavyInCur.length === 1 && curLen <= 3 && !curHasKey;
    const fits = heavyInCur.length === 0 || (heavyInCur.length === 1 && (leadIn || (curLen + len <= 7 && Math.min(curLen, len) <= 3 && !curHasKey && roles[k] !== "key")));
    if (!fits) {
      out.push(cur);
      cur = [];
      curLen = 0;
    }
    // a short word leading into the key word takes its colour ("A YEAR")
    if (roles[k] === "key") for (const x of cur) if (roles[x] === "heavy" && letters(words[x]!.text) <= 3) roles[x] = "key";
    cur.push(k);
    curLen += len;
    k++;
  }
  if (cur.length) out.push(cur);
  return out;
}

export const EditorialStackLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, measure, settled } = p;
  const { sc, box, k, base: base0 } = ctxOf(p);
  const kk = Math.min(1.8, k);
  const seed = hash(page.id);
  const side = cardOrdinal(page) % 2 === 0 ? 1 : -1; // +1: right-aligned, hugging the right
  const accent = style.active.color;
  const keyI = keyWordIndex(page);
  const roles = rolesOf(page.words, keyI);
  const groups = linesOf(page.words, roles);
  const sb = style.safeBox;
  const safe = { l: canvas.width * sb.left, r: canvas.width * (1 - sb.right), t: canvas.height * sb.top, b: canvas.height * (1 - sb.bottom) };

  // ---------------------------------------------------------------- the lockup at a base size
  const layout = (base: number) => {
    const ls = style.letterSpacing * sc * (base / base0);
    const faceOf = (role: Role, size: number): Face =>
      role === "serif" ? { fontId: STACK_SERIF, weight: 400, size, ls: -0.005 * size } : { fontId: style.fontId, weight: style.fontWeight, italic: style.fontStyle === "italic", size, ls: ls * (size / base) };
    const textOf = (w: Word, role: Role) => (role === "serif" ? displayText(w, style, "none") : displayText(w, style));
    const gapOf = (size: number) => GAP_EM * size + style.wordSpacing * sc * (size / base0);
    const natural = groups.map((g) => {
      const items = g.map((i) => {
        const role = roles[i]!;
        // the key word is the hero of the lockup: it is set larger and sets the measure the others grow toward
        const size = role === "serif" ? SERIF_K * base : role === "key" ? KEY_K * base : base;
        const text = textOf(page.words[i]!, role);
        return { i, role, size, text, width: glyphsOf(text, faceOf(role, size), measure).width };
      });
      const width = items.reduce((a, it) => a + it.width, 0) + items.slice(1).reduce((a, it) => a + gapOf(it.size), 0);
      const hv = items.filter((it) => it.role !== "serif");
      const heavyWidth = hv.reduce((a, it) => a + it.width, 0) + hv.slice(1).reduce((a, it) => a + gapOf(it.size), 0);
      return { items, width, heavyWidth, heavy: hv.length > 0, key: hv.some((it) => it.role === "key") };
    });
    // the measure is set by the heavy words only (a serif word riding on a line hangs off its edge)
    const measureW = Math.max(MIN_BLOCK_EM * base, ...natural.filter((l) => l.heavy).map((l) => l.heavyWidth));
    // heavy lines grow toward the common measure, but never past the key word: it stays the hero
    const keySize = natural.some((l) => l.key) ? Math.max(...natural.filter((l) => l.key).map((l) => KEY_K * base * clamp(measureW / Math.max(1, l.heavyWidth), 1, MAX_GROW))) : Infinity;
    const grow = natural.map((l) => {
      if (!l.heavy) return 0;
      const g = clamp(measureW / Math.max(1, l.heavyWidth), 1, MAX_GROW);
      return l.key ? g : Math.max(1, Math.min(g, (0.94 * keySize) / base));
    });
    natural.forEach((l, li) => {
      if (l.heavy) return;
      const near = [grow[li - 1], grow[li + 1]].filter((g): g is number => !!g);
      let g = near.length ? near.reduce((a, b) => a + b, 0) / near.length : 1;
      if (l.width * g > measureW) g = measureW / l.width;
      grow[li] = g;
    });
    const blockW = Math.max(1, ...natural.map((l, li) => l.width * grow[li]!));
    const hasHeavy = natural.some((l) => l.heavy);

    // vertical: negative leading, each line's cap top tucked under the previous line's baseline
    const lines: LLine[] = [];
    let prevBase = 0;
    let prevDesc = 0;
    let prevSize = 0;
    let prevHeavy = true;
    let serifLine = 0;
    natural.forEach((l, li) => {
      const g = grow[li]!;
      const words: LWord[] = l.items.map((it) => {
        const size = it.size * g;
        return { w: page.words[it.i]!, i: it.i, role: it.role, text: it.text, face: faceOf(it.role, size), size, width: it.width * g, x: 0, baseline: 0 };
      });
      const lineSize = Math.max(...words.map((w) => w.size));
      const asc = l.heavy ? CAP_EM * lineSize : SERIF_ASC_EM * lineSize;
      const desc = l.heavy ? 0 : SERIF_DESC_EM * lineSize;
      // heavy on heavy overlaps the full amount; a serif line tucks in by half, so its small words stay clear
      // (never more than 30 % of the smaller line's size, so a short line grown big never buries the one behind)
      const gap0 = li === 0 ? 0 : (style.lineHeight - 1) * 0.5 * (prevSize + lineSize) * (l.heavy && prevHeavy ? 1 : 0.5);
      const gap = gap0 < 0 ? Math.max(gap0, -0.3 * Math.min(prevSize, lineSize)) : gap0;
      const baseline = li === 0 ? asc : prevBase + prevDesc + gap + asc;
      // horizontal: hug the card's side; a short pair of serif words is spread to the lockup's edges
      const total = l.width * g;
      const justify = !l.heavy && words.length === 2 && hasHeavy && total < 0.8 * blockW;
      let align = side;
      if (!l.heavy && !justify) align = serifLine++ % 2 === 0 ? side : -side;
      let x = justify ? 0 : align > 0 ? blockW - total : 0;
      const spread = justify ? (blockW - words.reduce((a, w) => a + w.width, 0)) / (words.length - 1) : 0;
      words.forEach((w, j) => {
        if (j) x += justify ? spread : gapOf(w.size);
        w.x = x;
        w.baseline = baseline;
        x += w.width;
      });
      lines.push({ words, start: Math.min(...words.map((w) => appearAt(w.w))), top: baseline - asc, bottom: baseline + desc });
      prevBase = baseline;
      prevDesc = desc;
      prevSize = lineSize;
      prevHeavy = l.heavy;
    });
    const top = Math.min(...lines.map((l) => l.top));
    const bottom = Math.max(...lines.map((l) => l.bottom));
    return { lines, blockW, H: Math.max(1, bottom - top), top };
  };
  let L = layout(base0);
  const fit = Math.min(1, box.width / L.blockW, ((safe.b - safe.t) * 0.4) / L.H);
  if (fit < 0.999) L = layout(base0 * fit);
  const { lines, blockW: W, H } = L;
  const oy = L.top;
  const base = base0 * fit;
  const P = PERSPECTIVE_W * W;

  // ---------------------------------------------------------------- timing
  const tEval = (t: number) => (settled ? Number.POSITIVE_INFINITY : t);
  const arrive = (li: number, t: number) => (settled ? 1 : AE.out(clamp01((t - lines[li]!.start) / LINE_IN_MS)));
  const nL = lines.length;
  const exitMs = exitWindow(page, 260);
  const exitStart = page.endMs - exitMs;
  const ex = settled ? 0 : AE.in(clamp01((timeMs - exitStart) / Math.max(1, exitMs)));
  const tc = timeMs - page.startMs;

  // ---------------------------------------------------------------- the camera (re-frames as lines land)
  const lineCy = lines.map((l) => (l.top + l.bottom) / 2 - oy - H / 2);
  const lineCx = lines.map((l) => {
    const xs = l.words.map((w) => w.x);
    const xe = l.words.map((w) => w.x + w.width);
    return (Math.min(...xs) + Math.max(...xe)) / 2 - W / 2;
  });
  const camAt = (t: number) => {
    let sw = 0;
    let cx = 0;
    let cy = 0;
    for (let li = 0; li < nL; li++) {
      const a = arrive(li, t);
      sw += a;
      cx += a * lineCx[li]!;
      cy += a * lineCy[li]!;
    }
    const f = nL > 0 ? sw / nL : 1;
    const c = sw > 0.001 ? { x: cx / sw, y: cy / sw } : { x: lineCx[0] ?? 0, y: lineCy[0] ?? 0 };
    // close on the first line, pulling back (log space) as the stack grows, never wider than the safe area
    const zMax = Math.max(1, Math.min(1 + 0.42 * kk, ((safe.r - safe.l) * 0.94) / W, ((safe.b - safe.t) * 0.5) / H));
    const z = Math.pow(zMax, 1 - f);
    const drift = settled ? 1 : 1 + 0.03 * kk * clamp01(tc / Math.max(1200, page.endMs - page.startMs));
    return { x: -c.x * z * 0.85, y: -c.y * z * 0.85, z: z * drift, f };
  };
  const cam = camAt(timeMs);
  // the plane orbits from almost frontal to its full tilt as the lockup builds; a slow sway keeps it alive
  const sway = settled ? 0 : Math.sin((2 * Math.PI * tc) / 4600 + (seed % 7)) * 0.8 * kk;
  const ay = -side * (TILT_Y * Math.min(1.4, kk) * lerp(0.45, 1, cam.f) + sway);
  // bottom toward the camera: the newest (lowest) lines are the nearest
  const ax = -TILT_X * Math.min(1.4, kk) + (settled ? 0 : 0.4 * kk * Math.sin((2 * Math.PI * tc) / 5300));
  const ca = Math.cos((ay * Math.PI) / 180);
  const sa = Math.sin((ay * Math.PI) / 180);
  const cb = Math.cos((ax * Math.PI) / 180);
  const sbx = Math.sin((ax * Math.PI) / 180);
  /** rotate (y then x) and project a lockup-centred point; returns screen offset and scale */
  const project = (x: number, y: number, z: number) => {
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    const y2 = y * cb - z1 * sbx;
    const z2 = y * sbx + z1 * cb;
    const s = P / Math.max(P * 0.2, P + z2);
    return { x: x1 * s, y: y2 * s, s };
  };
  // keystone: the slope a horizontal (vertical) edge takes at this point, as skew angles
  const skewAt = (x: number, y: number) => ({
    sy: (Math.atan((-y * sa * cb) / P) * 180) / Math.PI,
    sx: (Math.atan((x * sbx) / P) * 180) / Math.PI,
  });

  // ---------------------------------------------------------------- paint helpers
  const ratioOf = (size: number) => size / base;
  const groupShadows = (size: number, a = 1) =>
    style.shadows.map((s) => `drop-shadow(${px(s.x * sc * ratioOf(size) * fit)} ${px(s.y * sc * ratioOf(size) * fit)} ${px(s.blur * sc * ratioOf(size) * fit)} ${a < 1 ? fade(s.color, a) : s.color})`);
  const keyGradient = (w: Word) => {
    if (w.color) return null;
    // a heat gradient: a near-white top edge, the accent through the body
    return `linear-gradient(180deg, ${mixHex(accent, "#FFFFFF", 0.55)} 0%, ${mixHex(accent, "#FFFFFF", 0.12)} 34%, ${accent} 62%, ${accent} 100%)`;
  };

  // ---------------------------------------------------------------- the words
  let gi = 0;
  const groupsOut: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    // z: every line that lands in front pushes this one back
    let depth = 0;
    for (let j = li + 1; j < nL; j++) depth += arrive(j, timeMs);
    const zLine = depth * Z_STEP * P * Math.min(1.3, 0.5 + kk * 0.5);
    const dim = 1 - Math.min(0.38, 0.14 * depth);
    const near = project(lineCx[li]!, lineCy[li]!, 0);
    const far = project(lineCx[li]!, lineCy[li]!, zLine);
    const hold = { x: (near.x - far.x) * 0.8, y: near.y - far.y };
    // depth of field: lines pushed back soften a touch
    const dof = Math.min(1.2, 0.45 * depth) * (base / 100);
    for (const lw of line.words) {
      const { w, size, face } = lw;
      const t0 = appearAt(w);
      if (!settled && timeMs < t0) {
        gi += Array.from(lw.text).length;
        continue;
      }
      const isKey = lw.role === "key";
      const isSerif = lw.role === "serif";
      const blEm = isSerif ? SERIF_BL_EM : HEAVY_BL_EM;
      const top = lw.baseline - blEm * size - oy;
      const { glyphs, width } = glyphsOf(lw.text, face, measure);
      const fillColor = w.color ?? (isKey ? accent : style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color);
      const gradient = w.color ? null : isKey ? keyGradient(w) : isSerif ? null : gradientImage(style.fill);
      const stroke = strokeCss(style, sc, ratioOf(size) * fit);
      const css = faceCss(face, 1);
      // spoken: the key word punches a touch toward the camera
      const punch = settled || !isKey ? 0 : 0.05 * kk * impulse(timeMs - w.startMs, 110);
      const per = Math.min(34, 260 / Math.max(1, glyphs.length));
      const letterEls = glyphs.map((g, ci) => {
        const r = (salt: number) => rand(seed, gi * 7 + salt);
        gi++;
        const start = t0 + ci * per + (ci ? (r(1) - 0.5) * 14 : 0);
        const restCx = lw.x + g.x + g.solo / 2 - W / 2;
        const restCy = top + size / 2 - H / 2;
        // seeded flight: from below, scattered sideways, out of depth (toward the camera), a little rotation
        const dx0 = (r(2) - 0.5) * 1.1 * size * kk;
        const dy0 = (0.75 + 0.9 * r(3)) * size * kk * (isSerif ? 0.8 : 1);
        const dz0 = -(0.12 + 0.1 * r(4)) * P * kk;
        const rot0 = (r(5) - 0.5) * (isKey ? 50 : 34) * kk;
        const stateAt = (t: number) => {
          const tt = tEval(t);
          const u = tt === Number.POSITIVE_INFINITY ? 1 : spring(tt - start, 3.1, 0.64);
          const ur = tt === Number.POSITIVE_INFINITY ? 1 : spring(tt - start - 20, 2.6, 0.58);
          const z = zLine - punch * P + dz0 * (1 - u);
          const pr = project(restCx + dx0 * (1 - u), restCy + dy0 * (1 - u), z);
          // a line pushed back recedes and shrinks about its own centre (most of the slide toward the vanishing
          // point is taken out), so it stays readable behind the newer lines instead of sliding under them
          return { x: pr.x + hold.x, y: pr.y + hold.y, s: pr.s, rot: rot0 * (1 - ur) };
        };
        if (!settled && timeMs < start) return null;
        const st = stateAt(timeMs);
        let vx = 0;
        let vy = 0;
        if (!settled) {
          const a = stateAt(timeMs - FRAME / 2);
          const b = stateAt(timeMs + FRAME / 2);
          vx = b.x - a.x;
          vy = b.y - a.y;
        }
        const speed = Math.hypot(vx, vy);
        const blur = Math.min(0.09 * size, speed * 0.28);
        const stretchY = 1 + Math.min(0.85, (Math.abs(vy) / size) * 0.9);
        const stretchX = 1 + Math.min(0.35, (Math.abs(vx) / size) * 0.5);
        const op = settled ? 1 : clamp01((timeMs - start) / 70);
        const sk = skewAt(restCx, restCy);
        const tx = st.x - restCx;
        const ty = st.y - restCy;
        const tf = [
          `translate(${px(tx)}, ${px(ty)})`,
          stretchX > 1.002 || stretchY > 1.002 ? `scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})` : "",
          Math.abs(st.rot) > 0.01 ? `rotate(${st.rot.toFixed(3)}deg)` : "",
          `skewY(${sk.sy.toFixed(3)}deg) skewX(${sk.sx.toFixed(3)}deg)`,
          `scale(${st.s.toFixed(4)})`,
        ].filter(Boolean).join(" ");
        return (
          <span key={ci} style={{ position: "absolute", left: lw.x + g.x, top, transform: tf, opacity: op < 0.999 ? op : undefined, filter: blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : undefined, ...css }}>
            <Ink text={g.ch} css={{ ...css, display: "inline-block" }} color={fillColor} gradient={gradient} slice={gradient ? { w: width, h: size, x: g.x } : undefined} stroke={stroke} />
          </span>
        );
      });
      // the key word's glow ignites with a short flicker after it lands
      let glow: string[] = [];
      if (isKey && style.glow.enabled) {
        const ts = settled ? 9999 : timeMs - (t0 + 150);
        const flick = ts < 0 ? 0 : ts < 40 ? 0.55 : ts < 75 ? 0.12 : ts < 120 ? 0.8 : ts < 150 ? 0.45 : Math.min(1, 0.85 + ts / 1000);
        const gl = flick * style.glow.intensity;
        const gc = style.glow.color;
        if (gl > 0.01) glow = [`drop-shadow(0 0 ${px(0.045 * size)} ${withAlpha(gc, Math.min(1, 0.95 * gl))})`, `drop-shadow(0 0 ${px(style.glow.radius * sc * ratioOf(size) * fit)} ${withAlpha(gc, Math.min(1, 0.7 * gl))})`];
      }
      const exitBlur = ex * 0.08 * size;
      const filters = [
        dim < 0.995 ? `brightness(${dim.toFixed(3)})` : "",
        exitBlur + dof > 0.15 ? `blur(${(exitBlur + dof).toFixed(2)}px)` : "",
        ...groupShadows(size, glow.length ? 0.55 : 1),
        ...glow,
      ].filter(Boolean);
      groupsOut.push(
        <div key={w.id} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, filter: filters.length ? filters.join(" ") : undefined }}>
          {letterEls}
        </div>,
      );
    }
  });

  // side placement: the lockup hugs its side of the safe area, around the caption position
  const spanW = safe.r - safe.l;
  const room = Math.max(0, (spanW - W * cam.z * 1.12) / 2);
  const shiftX = side * Math.min(room, Math.max(0, (Math.min(spanW, box.width * 1.15) - W * cam.z) / 2) * 0.5);
  // the camera never carries the lockup out of the safe area (its far edges, with a margin for the tilt)
  const fitIn = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
  const hw = (W * cam.z * 1.06) / 2;
  const hh = (H * cam.z * 1.06) / 2;
  const offX = fitIn(shiftX + cam.x, safe.l + hw - box.cx, safe.r - hw - box.cx);
  const offY = fitIn(cam.y, safe.t + hh - box.cy, safe.b - hh - box.cy);
  const exitScale = 1 + 0.12 * kk * ex;
  return (
    <Frame p={p} size={base}>
      <div
        style={{
          position: "relative", width: W, height: H,
          transform: `translate(${px(offX)}, ${px(offY)}) scale(${(cam.z * exitScale).toFixed(4)})`,
          opacity: ex > 0.001 ? 1 - smoothstep(0.35, 1, ex) : undefined,
        }}
      >
        {groupsOut}
      </div>
    </Frame>
  );
};
