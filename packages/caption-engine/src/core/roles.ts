/**
 * Word roles (opt-in): what each word does in its sentence, so a look can draw a two-tier caption (small connectors,
 * big key words) or show only the key words as stamps. Deterministic rules, no model. See
 * packages/cli/docs/composition.md for the table.
 */
import { ProjectSettingsSchema, type CaptionDoc, type ProjectSettings, type Word, type WordRole } from "@capseasy/shared";
import { derivePages, endsSentence } from "./derive";
import { STOP_EN, STOP_HI, pickHeroIndex } from "./hero";

const EXTRA_CONNECTORS = new Set(["from", "into", "than", "then", "if", "when", "by", "about", "an", "our", "their", "his", "her", "me", "us", "them", "not", "no", "can", "will", "would", "could", "should", "have", "has", "had", "am", "been", "there", "these", "those", "what", "which", "who", "how", "up", "out", "all", "very", "really", "also"]);
// "do" (two) and "char" (four) are left out: they collide with English words
const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion", "trillion", "dozen", "half", "double", "triple",
  "ek", "teen", "paanch", "panch", "chhe", "saat", "aath", "nau", "das", "bees", "pachaas", "pachas", "sau", "hazaar", "hazar", "lakh", "lakhs", "crore", "crores", "karod",
]);
const OPEN_QUOTE = /^["“«„]/;
const CLOSE_QUOTE = /["”»]["')\].,!?:;…]*$/;

const clean = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "");
const letters = (t: string) => t.replace(/[^\p{L}]/gu, "");
const isAllCaps = (t: string) => {
  const l = letters(t);
  return l.length > 0 && l === l.toUpperCase() && l !== l.toLowerCase();
};

export const isNumberWord = (text: string) => /\p{Nd}/u.test(text) || /^[$€£₹¥]/.test(text.trim()) || /%[^\p{L}]*$/u.test(text) || NUMBER_WORDS.has(clean(text).toLowerCase());
export const isConnectorWord = (text: string) => {
  const c = clean(text).toLowerCase();
  return !!c && (STOP_EN.has(c) || STOP_HI.has(c) || EXTRA_CONNECTORS.has(c));
};

export interface AssignRolesOptions {
  /** roles given by the caller, by index into `words` (undefined/null = decide) */
  explicit?: (WordRole | null | undefined)[];
  /** fill the words without an explicit role by the rules (default true) */
  auto?: boolean;
  /** pacing used to find each card's key word (defaults to 3 words per card) */
  settings?: ProjectSettings;
}

/**
 * Roles for `words` (same order and length). Explicit roles always win; with `auto` the rest follow the rules:
 * number, title (quoted), emphasis (shouted), name (capitalised mid-sentence / acronym), connector (function
 * word), key (each card's key word); anything else stays undefined (plain body text).
 */
export function assignRoles(words: Word[], opts: AssignRolesOptions = {}): (WordRole | undefined)[] {
  const out: (WordRole | undefined)[] = words.map((_, i) => opts.explicit?.[i] ?? undefined);
  if (opts.auto === false) return out;
  const n = words.length;
  // shouty or Title Case transcripts: capitalisation carries no meaning there
  const caps = words.filter((w) => letters(w.text).length > 1 && isAllCaps(w.text)).length;
  const capsMeaningful = caps <= n * 0.5;
  const titled = words.filter((w, i) => i > 0 && /^\p{Lu}/u.test(letters(w.text))).length;
  const capitalMeaningful = titled <= Math.max(1, (n - 1) * 0.6);

  let inQuote = false;
  words.forEach((w, i) => {
    const text = w.text.trim();
    const opens = OPEN_QUOTE.test(text);
    const quoted = inQuote || opens;
    if (opens) inQuote = true;
    if (inQuote && CLOSE_QUOTE.test(text) && !(opens && text.length === 1)) inQuote = false;
    if (out[i] !== undefined) return;
    const l = letters(text);
    const prev = words[i - 1];
    if (isNumberWord(text)) out[i] = "number";
    else if (quoted) out[i] = "title";
    else if (w.emphasis === "strong" || (capsMeaningful && l.length >= 4 && isAllCaps(text)) || (/!+["')\]]*$/.test(text) && l.length >= 3)) out[i] = "emphasis";
    else if (
      (capsMeaningful && l.length >= 2 && l.length <= 3 && isAllCaps(text) && l !== "I") ||
      (capitalMeaningful && i > 0 && prev && !endsSentence(prev.text) && /^\p{Lu}\p{Ll}/u.test(l) && !/^I('|’|$)/.test(text))
    )
      out[i] = "name";
    else if (isConnectorWord(text)) out[i] = "connector";
  });

  // the key word of each card: the hero picker on cards cut the way the renderer cuts them (by characters here)
  const settings = opts.settings ?? ProjectSettingsSchema.parse({});
  const doc = { version: 2, language: "en", direction: "ltr", words: words.map((w) => ({ ...w, hidden: false })), manualBreaks: [], noBreakAfter: [], cards: {}, meta: { userEdited: false } } as CaptionDoc;
  const index = new Map(words.map((w, i) => [w.id, i]));
  for (const page of derivePages(doc, settings)) {
    const hero = page.words.findIndex((w) => w.emphasis === "hero");
    const k = hero >= 0 ? hero : pickHeroIndex(page.words);
    const i = index.get(page.words[k]?.id ?? "");
    if (i !== undefined && out[i] === undefined && clean(words[i]!.text)) out[i] = "key";
  }
  return out;
}
