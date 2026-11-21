/**
 * Caption rules: the common-sense limits every look in the library is held to. The written version, with the reasons,
 * is packages/cli/src/director/SKILL.md ("Taste rules"). They are enforced in two places:
 *  - the library: packages/web/scripts/calibrate.mjs measures every look live at 1080x1920 and writes the smallest
 *    fix that brings it inside these limits to looks/rules.generated.json, which registry.ts applies to the look;
 *    packages/web/scripts/audit.mjs re-measures and fails a look that still breaks a rule
 *  - per video: the caption director (packages/cli/src/director) picks words per card, key words and position inside
 *    the same limits.
 * All pixel values are at 1080 x 1920 (9:16); other sizes scale with the short edge.
 */
export const CAPTION_RULES = {
  frame: { width: 1080, height: 1920 },
  /** Shorts / Reels / TikTok safe area: platform UI never covers text inside it */
  safe: { x0: 70, x1: 905, y0: 230, y1: 1480 },
  /**
   * Where captions sit when nothing is known about the picture: the lower band, under a talking head's face and above
   * the platform UI. With face boxes the director may use the upper band instead (y 230-560).
   */
  lowerBand: { y0: 1060, y1: 1480 },
  upperBand: { y0: 230, y1: 560 },
  /** the smallest any visible word may be (px of font size). The hard floor is 26 px; the library keeps to 46. */
  minTextPx: 46,
  hardMinTextPx: 26,
  /** the biggest word on screen must be at least this, so the line reads at phone size */
  minLeadPx: 72,
  /** the biggest word in a settled card (an entrance may overshoot briefly) */
  maxLeadPx: 170,
  /** largest word / smallest word on screen: above this a card reads as one word plus noise */
  maxSizeRatio: 3,
  /** words in one card (cue) */
  maxWordsPerCard: 4,
  /** the share of a card's words that may get the emphasis effect (key words only, never every word) */
  maxEmphasisShare: 0.5,
} as const;

export type CaptionRules = typeof CAPTION_RULES;

/** What measuring a look produced (packages/web/scripts/measure.mjs), in px at 1080x1920. */
export interface LookMeasurement {
  /** median over settled frames of the smallest / largest visible word's font size */
  minSize: number;
  maxSize: number;
  /** median over frames of largest / smallest in the same frame */
  ratio: number;
  /** median box of all visible text */
  box: { x0: number; y0: number; x1: number; y1: number };
  wordsPerCard?: number;
}

/** The rules a measured look breaks (empty = it keeps to all of them). Allows 2 px of measuring noise. */
export function ruleIssues(m: LookMeasurement, rules: CaptionRules = CAPTION_RULES): string[] {
  const out: string[] = [];
  const r = Math.round;
  if (m.minSize < rules.minTextPx - 2) out.push(`smallest word ${r(m.minSize)}px < ${rules.minTextPx}px`);
  if (m.maxSize < rules.minLeadPx - 2) out.push(`lead word ${r(m.maxSize)}px < ${rules.minLeadPx}px`);
  if (m.maxSize > rules.maxLeadPx + 2) out.push(`lead word ${r(m.maxSize)}px > ${rules.maxLeadPx}px`);
  if (m.ratio > rules.maxSizeRatio + 0.05) out.push(`size jump x${m.ratio.toFixed(1)} > x${rules.maxSizeRatio}`);
  const { safe, lowerBand } = rules;
  if (m.box.x0 < safe.x0 - 2 || m.box.x1 > safe.x1 + 2) out.push(`text x ${r(m.box.x0)}-${r(m.box.x1)} outside ${safe.x0}-${safe.x1}`);
  if (m.box.y0 < safe.y0 - 2 || m.box.y1 > safe.y1 + 2) out.push(`text y ${r(m.box.y0)}-${r(m.box.y1)} outside ${safe.y0}-${safe.y1}`);
  else if (m.box.y0 < lowerBand.y0 - 2) out.push(`text y ${r(m.box.y0)} above the lower band (${lowerBand.y0}): may cover a face`);
  if (m.wordsPerCard !== undefined && m.wordsPerCard > rules.maxWordsPerCard) out.push(`${m.wordsPerCard} words a card > ${rules.maxWordsPerCard}`);
  return out;
}

/** A look's rules fix, as calibrate.mjs writes it to looks/rules.generated.json. */
export interface LookRulesFix {
  /** multiplies style.fontSize */
  fontScale?: number;
  /** replaces style.maxWidth (fraction of the frame width) */
  maxWidth?: number;
  /** replaces style.position (centre of the caption block, frame fractions) */
  position?: { x: number; y: number };
  /** replaces style.hero.scale */
  heroScale?: number;
  /** replaces settings.maxWordsPerCard */
  maxWordsPerCard?: number;
  /** what was wrong, for reviewers */
  why?: string[];
}
