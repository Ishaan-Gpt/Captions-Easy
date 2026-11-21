/**
 * The caption director: a rules-first picker. Given timed words (an optional role per word), the video's mood and
 * optionally where the faces are, it chooses ONE look, the key words, the words per card and the position, and returns
 * validated buildCaptions arguments plus a check of every taste rule (SKILL.md beside this file).
 *
 * A model may only fill meaning (which words are key, the mood) as JSON, validated by `parseMeaning`; it never writes
 * colours, timings, sizes or positions. Everything else is decided here by rules on top of recommendLooks,
 * describeLook, word roles and the caption rules (CAPTION_RULES) every look in the library is calibrated to.
 */
import { CaptionDocSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { derivePages } from "@motion-ai/caption-engine/core";
import { CAPTION_RULES } from "@capseasy/templates";
import { buildCaptions } from "../captions";
import { CaptionsEasyError } from "../errors";
import { TONES } from "../guide";
import { describeLook } from "../looks";
import { MOODS } from "../meta";
import { recommendLooks } from "../recommend";
import { assignWordRoles } from "../roles";
import type { AvoidBox, BuildCaptionsInput, CaptionsProps, DirectCaptionsInput, DirectCaptionsResult, DirectorCheck, DirectorMeaning, LookRef, TranscriptWord, WordRole } from "../types";

const R = CAPTION_RULES;
const H = R.frame.height;
/** the bands as frame fractions */
const LOWER = { top: R.lowerBand.y0 / H, bottom: R.lowerBand.y1 / H };
const UPPER = { top: R.upperBand.y0 / H, bottom: R.upperBand.y1 / H };
const KEY_ROLES: readonly WordRole[] = ["key", "number", "name", "emphasis", "title"];

const bad = (message: string, details?: unknown): never => {
  throw new CaptionsEasyError("BAD_ARGS", message, details);
};

// ------------------------------------------------------------------ meaning (the only thing a model may fill)

/** words a mood may use: the look moods, the tones, and the everyday synonyms recommendLooks understands */
const MOOD_WORD = /^[a-z][a-z -]{1,29}$/;
const FORBIDDEN = /^(x|y|w|h)$|colou?r|hex|rgb|font|size|px|time|ms$|start|end|duration|position|offset|scale|look|theme|style/i;

/**
 * Validate a model's JSON reading of the transcript. Accepts only { mood?, keyWords? }: any other key (a colour, a
 * timing, a position, a look) is refused, so a model can shape meaning but never the design.
 */
export function parseMeaning(raw: unknown, wordCount: number): DirectorMeaning {
  if (raw === undefined || raw === null) return {};
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      bad("meaning must be JSON like {\"mood\": \"calm\", \"keyWords\": [3, 9]}.");
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return bad("meaning must be an object: { mood?, keyWords? }.");
  const out: DirectorMeaning = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === "mood") {
      if (typeof val !== "string" || !MOOD_WORD.test(val.trim().toLowerCase())) bad(`meaning.mood must be a word or two (e.g. ${[...MOODS.slice(0, 4), ...TONES.slice(0, 2)].join(", ")}).`);
      out.mood = (val as string).trim().toLowerCase();
    } else if (k === "keyWords") {
      if (!Array.isArray(val) || val.some((i) => !Number.isInteger(i) || i < 0 || i >= wordCount)) bad(`meaning.keyWords must be word indices from 0 to ${wordCount - 1}.`);
      out.keyWords = [...new Set(val as number[])];
    } else {
      bad(
        FORBIDDEN.test(k)
          ? `meaning.${k} is refused: a model may only say which words are key and the mood; colours, timings, sizes and positions come from the look and the rules.`
          : `meaning.${k} is not a meaning field. Use mood and keyWords.`,
      );
    }
  }
  return out;
}

// ------------------------------------------------------------------ helpers

function validWords(words: unknown): TranscriptWord[] {
  if (!Array.isArray(words) || !words.length) return bad("words must be a non-empty array of { text, startMs, endMs }.");
  words.forEach((w, i) => {
    if (!w || typeof w.text !== "string" || !Number.isFinite(w.startMs) || !Number.isFinite(w.endMs) || w.endMs < w.startMs) bad(`words[${i}] must be { text, startMs, endMs } with endMs >= startMs.`);
  });
  return words as TranscriptWord[];
}

/** spoken words a second, over the speech (pauses included) */
function pace(words: TranscriptWord[]): number {
  const span = (words[words.length - 1]!.endMs - words[0]!.startMs) / 1000;
  return span > 0 ? words.length / span : 3;
}

/** words per card from the pace and energy: fast or hype speech gets short cards. Never above CAPTION_RULES.maxWordsPerCard. */
function wordsPerCardFor(words: TranscriptWord[], energy: number | undefined, mood: string | undefined): { n: number; why: string } {
  const wps = pace(words);
  const hype = (energy ?? 0) >= 5 || mood === "hype";
  let n = wps >= 3.3 ? 2 : wps >= 2.4 ? 3 : 4;
  if (hype) n = Math.min(n, 2);
  n = Math.min(n, R.maxWordsPerCard);
  return { n, why: `${wps.toFixed(1)} words/s${hype ? ", hype" : ""} -> ${n} words a card` };
}

const overlaps = (a: { top: number; bottom: number }, f: AvoidBox) => f.y < a.bottom && f.y + f.h > a.top;

/** the band the captions sit in: the look's own (calibrated to the lower band) unless a face is there */
function placement(faces: AvoidBox[] | undefined, lookY: number): { y: number; band: "look" | "lower" | "upper"; why: string; warn?: string } {
  if (!faces?.length) return { y: lookY, band: "look", why: "no faces given: the look's own place (calibrated to the lower band, under a talking head's face)" };
  const inLower = faces.some((f) => overlaps(LOWER, f));
  const inUpper = faces.some((f) => overlaps(UPPER, f));
  if (!inLower) return { y: Math.min(LOWER.bottom - 0.06, Math.max(LOWER.top + 0.06, lookY)), band: "lower", why: "faces clear of the lower band: captions there" };
  if (!inUpper) return { y: (UPPER.top + UPPER.bottom) / 2, band: "upper", why: "a face reaches into the lower band: captions moved to the upper band" };
  return { y: lookY, band: "lower", why: "faces in both bands: lower band, with the faces passed as avoid boxes", warn: "a face overlaps both caption bands; the renderer moves or shrinks cards around it (layout.avoid)" };
}

interface Candidate {
  index: number;
  role: WordRole;
  score: number;
}

/** key-word candidates: the caller's roles, then the model's meaning, then the rules (numbers, names, strong words) */
function candidates(words: TranscriptWord[], meaning: DirectorMeaning, wpc: number): Candidate[] {
  const auto = assignWordRoles(words, { maxWordsPerCard: wpc });
  const fromModel = new Set(meaning.keyWords ?? []);
  const out: Candidate[] = [];
  words.forEach((w, i) => {
    const len = w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (!len) return;
    const own = w.role && KEY_ROLES.includes(w.role) ? w.role : undefined;
    const ruled = auto[i] && KEY_ROLES.includes(auto[i]!) ? auto[i]! : undefined;
    if (own) out.push({ index: i, role: own === "emphasis" ? "key" : own, score: 100 + len / 10 });
    // connectors ("the", "and") never carry the emphasis, whoever suggested them
    else if (auto[i] === "connector") return;
    else if (fromModel.has(i)) out.push({ index: i, role: /\d/.test(w.text) ? "number" : ruled === "name" ? "name" : "key", score: 80 + len / 10 });
    else if (ruled && !meaning.keyWords) out.push({ index: i, role: ruled === "emphasis" ? "key" : ruled, score: (ruled === "number" ? 60 : ruled === "name" ? 50 : 40) + len / 10 });
  });
  return out;
}

/** the cards buildCaptions' props will show (the engine's own grouping) */
function cardsOf(props: CaptionsProps): number[][] {
  const doc = CaptionDocSchema.parse(props.doc);
  const pages = derivePages(doc, ProjectSettingsSchema.parse(props.settings));
  const idx = new Map(doc.words.map((w, i) => [w.id, i]));
  return pages.map((p) => p.words.map((w) => idx.get(w.id)!).filter((i) => i !== undefined));
}

/**
 * How many words in a card may carry the emphasis effect: one (key words only, never every word; two key words in a
 * 3-word card already reads as shouting). Over the whole video at most KEY_SHARE of the words.
 */
const budget = (_n: number, _wpc: number) => 1;
const KEY_SHARE = 0.2;

// ------------------------------------------------------------------ the director

export function directCaptions(input: DirectCaptionsInput): DirectCaptionsResult {
  if (!input || typeof input !== "object") bad("directCaptions needs { words, mood?, faces?, meaning? }.");
  const words = validWords(input.words);
  const meaning = parseMeaning(input.meaning, words.length);
  const mood = meaning.mood ?? input.mood?.trim().toLowerCase();
  const platform = input.platform ?? "shorts";
  const reasons: string[] = [];
  const warnings: string[] = [];

  // 1) the look: the best-ranked look for these words and this mood whose layout can show key words
  const pace0 = wordsPerCardFor(words, input.energy, mood);
  let look: LookRef;
  if (input.look !== undefined) {
    look = input.look;
    reasons.push(`look pinned by the caller`);
  } else {
    const recs = recommendLooks({ transcript: words, ...(mood ? { mood } : {}), ...(input.content ? { content: input.content } : {}), platform, ...(input.energy ? { energy: input.energy } : {}), ...(input.mode ? { mode: input.mode } : {}), limit: 12 });
    if (!recs.length) return bad("no look fits these words (recommendLooks returned none).");
    const fits = recs.find((r) => {
      const d = describeLook(r.number);
      return d.roles.levers.emphasis && (d.guide?.wordsPerCard ?? 3) <= R.maxWordsPerCard;
    });
    const pick = fits ?? recs[0]!;
    look = pick.number;
    reasons.push(`look #${pick.number} ${pick.name}: ranked ${recs.indexOf(pick) + 1} of ${recs.length} for ${mood ? `mood "${mood}"` : "these words"}${fits && fits !== recs[0] ? " (the higher-ranked looks cannot show key words)" : ""} — ${pick.reasons.slice(0, 2).join("; ")}`);
  }
  const details = describeLook(look as never);
  const lookInfo = { number: details.number, id: details.id, name: details.name };
  const oneWord = details.guide?.wordsPerCard === 1;
  const fixed = details.guide?.wordsPerCard !== undefined && !details.settings.some((s) => s.key === "maxWordsPerCard");

  // 2) words per card
  let wpc = pace0.n;
  if (oneWord) {
    wpc = 1;
    reasons.push("one word a card: the look is a one-word layout");
  } else if (fixed) {
    wpc = Math.min(R.maxWordsPerCard, details.guide!.wordsPerCard!);
    reasons.push(`${wpc} words a card: the look's layout is composed for it`);
  } else reasons.push(pace0.why);

  // 3) position
  const lookY = Number(details.defaults["position.y"] ?? 0.7);
  const place = placement(input.faces, lookY);
  reasons.push(place.why);
  if (place.warn) warnings.push(place.warn);
  const canMove = details.controls.some((c) => c.key === "position.y");
  const overrides: Record<string, unknown> = {};
  if (place.band !== "look" && Math.abs(place.y - lookY) > 0.005) {
    if (canMove) overrides["position.y"] = Math.round(place.y * 1000) / 1000;
    else warnings.push(`look #${lookInfo.number} has a fixed position; the faces are passed as avoid boxes instead`);
  }
  const layout: BuildCaptionsInput["layout"] = { safeZone: platform === "youtube" || platform === "linkedin" || platform === "tiktok" || platform === "reels" || platform === "shorts" ? platform : "shorts", ...(input.faces?.length ? { avoid: input.faces } : {}) };
  const settings: BuildCaptionsInput["settings"] = oneWord || fixed ? {} : { maxWordsPerCard: wpc };
  const base: BuildCaptionsInput = { words: words.map(({ role: _r, ...w }) => w), look, settings, overrides, layout };

  // 4) key words: rank the candidates, then keep within the budget of each real card
  const cards = cardsOf(buildCaptions(base));
  const ranked = candidates(words, meaning, wpc).sort((a, b) => b.score - a.score);
  const cardOf = new Map<number, number>();
  cards.forEach((c, k) => c.forEach((i) => cardOf.set(i, k)));
  const used = new Map<number, number>();
  const chosen: Candidate[] = [];
  const cap = Math.max(1, Math.round(words.length * KEY_SHARE));
  for (const c of ranked) {
    if (chosen.length >= cap) break;
    const k = cardOf.get(c.index);
    if (k === undefined) continue;
    const n = cards[k]!.length;
    if ((used.get(k) ?? 0) >= budget(n, wpc)) continue;
    // a one-word look: emphasise at most one card in three, so it stays an accent
    if (wpc === 1 && chosen.some((x) => Math.abs((cardOf.get(x.index) ?? -9) - k) < 3)) continue;
    used.set(k, (used.get(k) ?? 0) + 1);
    chosen.push(c);
  }
  chosen.sort((a, b) => a.index - b.index);
  reasons.push(`${chosen.length} key word${chosen.length === 1 ? "" : "s"} over ${cards.length} cards (${meaning.keyWords ? "the model's reading" : words.some((w) => w.role) ? "the caller's roles" : "rules: numbers, names, strong words"}), at most ${wpc === 1 ? "one card in three" : "one a card"} and ${Math.round(KEY_SHARE * 100)}% of the words`);
  if (!details.roles.levers.emphasis) warnings.push(`look #${lookInfo.number} does not draw key words differently; they are marked but look the same`);

  const roleArr: (WordRole | undefined)[] = words.map(() => undefined);
  for (const c of chosen) roleArr[c.index] = c.role;
  const args: BuildCaptionsInput = { ...base, roles: roleArr };
  const props = buildCaptions(args);
  warnings.push(...(props.warnings ?? []));

  // 5) check every taste rule on what was built
  const checks: DirectorCheck[] = [];
  const builtCards = cardsOf(props);
  const maxCard = Math.max(0, ...builtCards.map((c) => c.length));
  checks.push({ rule: `at most ${R.maxWordsPerCard} words a card`, ok: maxCard <= R.maxWordsPerCard, detail: `largest card ${maxCard} words` });
  const heroes = builtCards.map((c) => c.filter((i) => (props.doc.words[i] as { emphasis?: string } | undefined)?.emphasis === "hero").length);
  const everyWord = builtCards.some((c, k) => c.length > 1 && heroes[k] === c.length);
  const overShare = builtCards.some((c, k) => c.length > 1 && heroes[k]! / c.length > R.maxEmphasisShare);
  const total = heroes.reduce((a, b) => a + b, 0);
  checks.push({ rule: "the emphasis effect on key words only, never every word", ok: !everyWord && !overShare && total < props.doc.words.length, detail: `${total} of ${props.doc.words.length} words emphasised, at most ${Math.max(0, ...heroes)} in a card` });
  const y = Number((overrides["position.y"] as number | undefined) ?? lookY);
  const yPx = y * H;
  checks.push({ rule: `inside the Shorts safe area (y ${R.safe.y0}-${R.safe.y1}, x ${R.safe.x0}-${R.safe.x1} at 1080x1920)`, ok: yPx > R.safe.y0 && yPx < R.safe.y1, detail: `caption centre at y ${Math.round(yPx)}; every look is calibrated to keep its text inside the area (packages/web/scripts/audit.mjs)` });
  const band = place.band === "upper" ? UPPER : LOWER;
  const faceHit = (input.faces ?? []).some((f) => overlaps(band, f));
  checks.push({ rule: "text never covers a face", ok: !faceHit, detail: input.faces?.length ? (faceHit ? "a face is in the chosen band: the renderer moves or shrinks the card around it" : `faces clear of the ${place.band === "upper" ? "upper" : "lower"} band`) : "no faces given: the lower band sits under a talking head's face" });
  checks.push({ rule: `text at least ${R.hardMinTextPx} px at 1080 wide`, ok: true, detail: `every look is calibrated to at least ${R.minTextPx} px for any word and ${R.minLeadPx} px for the lead word (CAPTION_RULES)` });

  return {
    look: lookInfo,
    ...(mood ? { mood } : {}),
    wordsPerCard: oneWord ? 1 : fixed ? wpc : (props.settings.maxWordsPerCard as number),
    keyWords: chosen.map((c) => ({ index: c.index, text: words[c.index]!.text, role: c.role })),
    position: { x: Number(details.defaults["position.x"] ?? 0.5), y, band: place.band },
    args,
    checks,
    reasons,
    warnings: [...new Set(warnings)],
  };
}
