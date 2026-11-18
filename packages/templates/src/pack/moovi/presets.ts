/**
 * Premium caption presets (caption mastery, 2026-10-18): one preset per reference Ishaan sends, approved by him.
 * Each preset is two things that describe the same caption: a captionseasy look (a base look number plus `--set`
 * overrides, valid keys only) and the Moovi player spec that `draw.ts` paints on a canvas, the same code in the live
 * preview and in the MP4 path (Chromium). None of these is a product default; wiring them into types comes later.
 * CaptionsEasy: ported from Moovi (packages/library/src/captions/premium @ d4e1133); the looks are in ../premium-moovi.tsx.
 */

import { glossKey, litKey, metalKey } from './theme';

export interface TierSpec {
  /** CSS font family, loaded from Google Fonts (`fonts` below) */
  font: string;
  weight: number;
  /** the face's own italic cut (a real italic, not a shear) */
  italic?: boolean;
  /** 'upper' (default) or 'none': the words as spoken (sentence case), punctuation still stripped */
  casing?: 'upper' | 'none' | 'lower' | 'title' | 'sentence';
  /** slant: horizontal shear (0.2 ≈ 11°), the italic of the red key line */
  skew?: number;
  /** corner softening: a round-joined stroke in the fill colour, as a share of the font size */
  round?: number;
  /** horizontal scale of the letters (a face set wider than it was cut, e.g. 1.08) */
  wide?: number;
  /** extra space between words, as a share of the font size */
  wordGap?: number;
  /** font-stretch keyword (a width axis), e.g. 'expanded' */
  stretch?: string;
  /** cap size as a share of the frame's short edge */
  size: number;
  /** tracking in em */
  tracking: number;
  /** fill: one colour, or a vertical gradient top → bottom */
  fill: string | string[];
  /** CaptionsEasy: the angle of a creator's gradient fill (degrees, CSS convention); absent = vertical top → bottom */
  fillAngle?: number;
  /** thin edge drawn under the fill (px at a 1080 short edge), or none */
  edge?: { color: string; width: number };
  /** soft drop shadow (share of short edge) */
  shadow?: { color: string; blur: number; dy: number };
  /** bloom: the word blurred at each radius (share of short edge) and screened on, wide+faint to tight+hot */
  glow?: { color: string; layers: { r: number; a: number; c?: string }[] };
  /** depth: this tier is painted behind the speaker (needs the person cut-out passed to drawCaption) */
  behind?: boolean;
  /**
   * the shiny negative (Premium Caption 3's highlight): the frame under the letters inverted, so the background decides
   * the colour, then pushed bright with `saturate`, `lift` and `contrast`, a `sheen` on top, shown at `opacity`
   */
  shiny?: { saturate: number; lift: number; contrast: number; sheen: number; opacity: number };
  /** bevel: a lit top-left rim and a dark bottom-right rim, `size` a share of the font size */
  bevel?: { size: number; light: string; dark: string; lightA: number; darkA: number };
  /** 3D: the letters extruded down-right by `depth` (share of the font size) in `steps` layers, `color` then `dark` */
  extrude?: { depth: number; color: string; dark: string; steps?: number };
  /** inner light: the letters' own shape blurred white over the fill, 0..1 */
  sheen?: number;
}

export interface PremiumPreset {
  id: string;
  name: string;
  /** the reference it was built from (data/refs/captions/<ref>, never committed) */
  ref: string;
  /** Google Fonts css2 families to load */
  fonts: string[];
  /** tier 1: the lead words; tier 2: the key word(s), the one the voice hits */
  tiers: [TierSpec, TierSpec, TierSpec?];
  /** CaptionsEasy: centre x of the card as a share of frame width (default 0.5) */
  x?: number;
  /** CaptionsEasy: widest line as a share of frame width (default 0.9; the stack and poster keys use their own) */
  fitW?: number;
  /** centre of the two-line block as a share of frame height (over the chest, off the face) */
  y: number;
  /** gap between the tiers as a share of short edge */
  gap: number;
  /** max words on a card, key word(s) included */
  maxWords: number;
  /** three tiers: up to this many words after the key stay on the card as a tail line (0 or absent: two tiers) */
  tailMax?: number;
  /**
   * The entry, decoded from the reference reel (30 fps): each word pops in at `scaleFrom`, soft (`blur`, share of the
   * short edge, sharp after `blurS` s), fading in over `fadeS`, and snaps to size on 1 - exp(-decay s) cos(freq s);
   * its glow flashes to 1 + `flash` and eases over `flashS`; the card then drifts smaller by `drift` per second.
   */
  enter: { scaleFrom: number; decay: number; freq: number; blur: number; blurS: number; fadeS: number; flash: number; flashS: number; drift: number; rise?: number; stagger?: number; writeS?: number };
  /** how the card is laid out: stacked centred tiers (default) or the kinetic mixed-size stack */
  layout?: 'tiers' | 'stack' | 'poster';
  /** captionseasy equivalent: `captionseasy build --look <base> --set k=v …` */
  captionseasy: { look: number; set: Record<string, string | number | boolean> };
}

/** The entry decoded from the reference reel (c02, 30 fps): ~5 frames from 1.22x and soft to sharp, a small bounce. */
/** The entry decoded from the reference reel (c02, 30 fps): ~5 frames from 1.22x and soft to sharp, a small bounce. */
const REEL_ENTER: PremiumPreset['enter'] = { scaleFrom: 1.22, decay: 11, freq: 15, blur: 0.01, blurS: 0.16, fadeS: 0.06, flash: 0.8, flashS: 0.3, drift: -0.025 };

export type Caption1Variant = '1.1' | '1.2';

/** The accents of the two references, for previews only: the product takes the accent from the video (theme.ts). */
export const REF_ACCENTS: Record<Caption1Variant, string> = { '1.1': '#52F42E', '1.2': '#FF3434' };

/**
 * Premium Caption 1 (refs c01 and the reel DbS2vcfyQxx, approved by Ishaan 2026-10-18): a white lead tier and the
 * spoken key word lit underneath, in any accent (the video's own, from `accentFromPixels`).
 *   1.1  both tiers caps, Russo One 600, letters set a little open (tracking +0.02 em)
 *   1.2  sentence-case white lead (Poppins 800) over a slanted key line
 * Ishaan's pick: Russo One at 600. It has one cut (400); a 4.5 % same-colour stroke thickens it to 600 identically on
 * every layer (the browser's synthetic bold skips offscreen layers, which ghosted the glow).
 */
export function premiumCaption1(variant: Caption1Variant, accent = REF_ACCENTS[variant]): PremiumPreset {
  const lit = litKey(accent);
  const key: TierSpec = {
    font: 'Russo One', weight: 400, round: 0.045, size: 0.1, tracking: 0.02, fill: lit.fill,
    // a dark bed under the word, then the bloom: the word reads highlighted, not just glowing
    shadow: { color: 'rgba(0,0,0,0.75)', blur: 0.04, dy: 0.01 },
    glow: lit.glow,
    sheen: 0.25,
  };
  const lead: TierSpec = variant === '1.1'
    ? { font: 'Russo One', weight: 400, round: 0.045, size: 0.07, tracking: 0.02, wordGap: 0.04, fill: ['#FFFFFF', '#FFFFFF', '#D9DDE3'], shadow: { color: 'rgba(0,0,0,0.7)', blur: 0.03, dy: 0.008 } }
    : { font: 'Poppins', weight: 800, casing: 'none', size: 0.068, tracking: -0.01, fill: ['#FFFFFF', '#FFFFFF', '#E2E2E6'], shadow: { color: 'rgba(0,0,0,0.7)', blur: 0.03, dy: 0.008 } };
  return {
    id: `premium-1-${variant.replace('.', '-')}`,
    name: `Premium Caption ${variant}`,
    ref: 'c01.png; reel DbS2vcfyQxx (0 s green, 4.9 s red)',
    fonts: variant === '1.1' ? ['Russo+One'] : ['Russo+One', 'Poppins:wght@800'],
    tiers: [lead, variant === '1.1' ? { ...key, wordGap: 0.04 } : { ...key, skew: 0.2 }],
    y: 0.8,
    gap: 0.016,
    maxWords: 4,
    enter: REEL_ENTER,
    captionseasy: {
      look: 34,
      set: {
        fontId: 'Russo One', fontWeight: 600, casing: 'upper', letterSpacing: -1, lineHeight: 1,
        'fill.color': '#FFFFFF', 'active.color': lit.glow.color, 'hero.scale': 1.43, 'hero.fontId': 'Russo One',
        'shadow.enabled': true, 'shadow.color': 'rgba(0,0,0,0.7)',
        'glow.enabled': true, 'glow.color': lit.glow.color, 'glow.radius': 24,
        'position.y': 0.8, maxWordsPerCard: 4, 'entrance.type': 'pop',
      },
    },
  };
}


/** The swatch of reference 2 (gold), for previews; the product takes the accent from the video like Caption 1. */
export const REF_ACCENT_2 = '#F2C94C';

/**
 * Premium Caption 2 (ref c03, reel DZsBWoCz04j): three tiers around the key words, hybrid type. A white lead in
 * Plus Jakarta Sans SemiBold Italic, the key words big in tall condensed caps (Antonio 500, slanted to match) with a
 * soft metallic gradient, and the words after them as a lighter tail (Medium Italic). Every tier sits in an After
 * Effects-style glow (its own light blurred wide and tight, screened back). Each word
 * fades in out of a heavy blur over ~7 frames, no bounce (read from the reel at 30 fps).
 */
export function premiumCaption2(accent = REF_ACCENT_2): PremiumPreset {
  // the After Effects glow: the letters' own light blurred wide and tight and added back, so every word sits in a haze
  const white = (size: number, weight: number): TierSpec => ({
    font: 'Plus Jakarta Sans', weight, italic: true, casing: 'none', size, tracking: -0.02, fill: ['#FFFFFF', '#FFFFFF', '#F1F0EC'],
    shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.025, dy: 0.006 },
    glow: { color: '#FFFFFF', layers: [{ r: 0.045, a: 0.28, c: '#FFF4E0' }, { r: 0.015, a: 0.42 }, { r: 0.004, a: 0.35 }] },
  });
  const metal = metalKey(accent);
  return {
    id: 'premium-2',
    name: 'Premium Caption 2',
    ref: 'c03 still; reel DZsBWoCz04j (0 to 8 s)',
    fonts: ['Plus+Jakarta+Sans:ital,wght@1,500;1,600', 'Antonio:wght@500'],
    tiers: [
      white(0.05, 600),
      {
        font: 'Antonio', weight: 500, skew: 0.12, size: 0.17, tracking: 0, fill: metal,
        shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.02, dy: 0.006 },
        glow: { color: metal[2]!, layers: [{ r: 0.07, a: 0.32, c: metal[3]! }, { r: 0.024, a: 0.45 }, { r: 0.006, a: 0.4, c: metal[0]! }] },
      },
      white(0.046, 500),
    ],
    y: 0.78,
    gap: 0.03,
    maxWords: 6,
    tailMax: 2,
    enter: { scaleFrom: 1.04, decay: 14, freq: 0, blur: 0.022, blurS: 0.24, fadeS: 0.2, flash: 0, flashS: 0.3, drift: -0.01 },
    captionseasy: {
      look: 34,
      set: {
        fontId: 'Plus Jakarta Sans', fontWeight: 600, casing: 'none', letterSpacing: -1, lineHeight: 1,
        'fill.color': '#FFFFFF', 'active.color': accent, 'hero.scale': 2.6, 'hero.fontId': 'Antonio',
        'shadow.enabled': true, 'shadow.color': 'rgba(0,0,0,0.45)', 'glow.enabled': false,
        'position.y': 0.78, maxWordsPerCard: 6, 'entrance.type': 'blur-in',
      },
    },
  };
}



/** The swatch of reference 3 (ice blue), for previews; the product takes the accent from the video. */
export const REF_ACCENT_3 = '#6EC6F5';

/**
 * Premium Caption 3 (ref c04, reel Dd76h-2RpSv): stacked cards composed like the reel's. Connector words small and
 * above-left, the highlighted word(s) big, the words after them right-aligned under the highlight. Plain words in clean
 * white Montserrat (content words Medium, connectors Regular and smaller). The highlight is Montserrat Bold behind the
 * speaker as a shiny negative of the frame: the background decides its colour (light blue over warm, orange over cool,
 * green over magenta...), pushed bright and saturated. The card never covers the face. Words slide up out of a blur.
 * No accent: the colour comes from the video itself.
 */
export function premiumCaption3(): PremiumPreset {
  const white = (weight: number, size: number): TierSpec => ({
    font: 'Montserrat', weight, casing: 'lower', size, tracking: -0.02, fill: '#FFFFFF',
    shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.02, dy: 0.004 },
  });
  return {
    id: 'premium-3',
    name: 'Premium Caption 3',
    ref: 'reel Dd76h-2RpSv',
    fonts: ['Montserrat:wght@400;500;700'],
    layout: 'stack',
    tiers: [
      white(500, 0.075),
      {
        font: 'Montserrat', weight: 700, casing: 'lower', size: 0.16, tracking: -0.03, fill: '#FFFFFF', behind: true,
        shiny: { saturate: 2.4, lift: 1.3, contrast: 1.15, sheen: 0.45, opacity: 0.95 },
        shadow: { color: 'rgba(0,0,0,0.2)', blur: 0.02, dy: 0 },
      },
      white(400, 0.05),
    ],
    y: 0.6,
    gap: 0.012,
    maxWords: 4,
    tailMax: 2,
    enter: { scaleFrom: 1, decay: 0, freq: 0, blur: 0.02, blurS: 0.28, fadeS: 0.1, flash: 0, flashS: 0.3, drift: -0.012, rise: 0.05 },
    captionseasy: {
      look: 34,
      set: {
        fontId: 'Montserrat', fontWeight: 600, casing: 'lower', letterSpacing: -1, lineHeight: 1,
        'fill.color': '#FFFFFF', 'active.color': '#FFFFFF', 'hero.scale': 2, 'hero.fontId': 'Montserrat',
        'shadow.enabled': true, 'shadow.color': 'rgba(0,0,0,0.4)', 'glow.enabled': false,
        'position.y': 0.74, maxWordsPerCard: 4, 'entrance.type': 'rise',
      },
    },
  };
}


/** The swatch of reference 4 (red), for previews; the product takes the accent from the video like the others. */
export const REF_ACCENT_4 = '#D42020';

/**
 * Premium Caption 4 (ref reel Dd1Mf7xzsbm, "3 different COUNTRIES", "Here's what NOBODY about working tells you"): a
 * poster card. The key word giant in League Gothic narrowed to a very tall set, a glossy accent ramp on a 3D block with a
 * drop shadow, standing behind the speaker from the forehead to below the shoulders, its letters rising one after
 * another out of a motion trail. The words before it a small white Sacramento script on its top-left corner, written
 * on; after it a white Poppins line over the chest, then the closing words in script under it, right-aligned.
 */
export function premiumCaption4(accent = REF_ACCENT_4): PremiumPreset {
  const g = glossKey(accent);
  // the small words must read on any background: a firm dark shadow under thin script and the sans line
  const strong = { color: 'rgba(0,0,0,0.7)', blur: 0.022, dy: 0.006 };
  return {
    id: 'premium-4',
    name: 'Premium Caption 4',
    ref: 'reel Dd1Mf7xzsbm (0-3 s, 18-19 s)',
    fonts: ['League+Gothic', 'Sacramento', 'Poppins:wght@600'],
    layout: 'poster',
    tiers: [
      { font: 'Sacramento', weight: 400, casing: 'none', size: 0.095, tracking: 0, fill: '#FFFFFF', shadow: strong, round: 0.02 },
      {
        font: 'League Gothic', weight: 400, wide: 0.62, size: 0.3, tracking: 0.01, fill: g.fill, behind: true,
        extrude: { depth: 0.05, color: g.side, dark: g.dark, steps: 12 },
        bevel: { size: 0.018, light: '#FFD0C8', dark: '#3A0006', lightA: 0.55, darkA: 0.6 },
        sheen: 0.12,
        // a firm, dark drop shadow: the word stands off any wall (the ref separates it from a busy background)
        shadow: { color: 'rgba(0,0,0,0.68)', blur: 0.04, dy: 0.02 },
      },
      { font: 'Poppins', weight: 600, casing: 'none', size: 0.05, tracking: -0.01, fill: '#FFFFFF', shadow: strong },
    ],
    y: 0.5,
    gap: 0.01,
    maxWords: 5,
    tailMax: 3,
    enter: { scaleFrom: 1, decay: 0, freq: 0, blur: 0, blurS: 0.22, fadeS: 0.06, flash: 0, flashS: 0.3, drift: -0.01, rise: 0.6, stagger: 0.035, writeS: 0.45 },
    captionseasy: {
      look: 34,
      set: {
        fontId: 'Poppins', fontWeight: 600, casing: 'none', letterSpacing: 0, lineHeight: 1,
        'fill.color': '#FFFFFF', 'active.color': accent, 'hero.scale': 4, 'hero.fontId': 'League Gothic',
        'shadow.enabled': true, 'shadow.color': 'rgba(0,0,0,0.5)', 'glow.enabled': false,
        'position.y': 0.5, maxWordsPerCard: 5, 'entrance.type': 'rise',
      },
    },
  };
}

export const PREMIUM_PRESETS: PremiumPreset[] = [premiumCaption1('1.1'), premiumCaption1('1.2'), premiumCaption2(), premiumCaption3(), premiumCaption4()];
