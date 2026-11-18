/**
 * Devanagari -> Hinglish romanizer: writes Hindi the way Indian creators type it ("pehle", "chalte the",
 * "karte hain", "kya", "nahi", "zindagi"), not as scholarly IAST/ITRANS ("pahalē", "calatē thē").
 *
 * Pure TypeScript, zero dependencies, deterministic. Pipeline per word:
 *   1. exceptions dictionary (~300 frequent words in their common Roman spelling, see romanize-dict.ts)
 *   2. otherwise a rule-based pass: parse into consonant/vowel units -> inherent-schwa deletion (word-final and
 *      medial, right to left, the standard VC_CV rule) -> Hinglish letter mapping with context rules
 *      (ा final "a" / closed last syllable "aa", ी final "i" / medial "ee", ू final "u" / medial "oo",
 *      anusvara/chandrabindu -> "n" or "m" before labials, "ein"/"ain"/"on" nasal endings, "eh" for
 *      schwa+h ("pehle", "kehna", "yeh"), nukta letters (z, f, q, d), conjuncts (ksh, gy, "achha", "baccha"),
 *      व as w/v, glide "ye" for ए after a vowel ("gaye", "liye", "chahiye"))
 *   3. an optional caller hook (sync or async, e.g. an LLM) that may override any word.
 * Latin, digits and punctuation pass through untouched (Devanagari digits become 0-9, danda becomes ".").
 */
import { HINGLISH_EXCEPTIONS } from "./romanize-dict";

export interface RomanizeWordContext {
  /** what the built-in romanizer produced for this word */
  builtIn: string;
  /** index of the word among the whitespace-separated words of the text */
  index: number;
  /** all whitespace-separated words of the original text (for context) */
  words: string[];
}
/** Return a string to replace the word, or null/undefined to keep the built-in result. */
export type RomanizeCallback = (word: string, ctx: RomanizeWordContext) => string | null | undefined;
export type RomanizeAsyncCallback = (word: string, ctx: RomanizeWordContext) => Promise<string | null | undefined> | string | null | undefined;

export interface RomanizeOptions {
  /** per-word override hook (e.g. an LLM); called once per distinct word that contains Devanagari */
  callback?: RomanizeCallback;
  /** use the exceptions dictionary (default true); false = rules only */
  dictionary?: boolean;
  /** extra/overriding exceptions: { "देव": "roman" } */
  exceptions?: Record<string, string>;
}
export interface RomanizeAsyncOptions extends Omit<RomanizeOptions, "callback"> {
  callback: RomanizeAsyncCallback;
}

// ------------------------------------------------------------------ character tables

const VIRAMA = "्";
const NUKTA = "़";
const ANUSVARA = "ं";
const CHANDRABINDU = "ँ";
const VISARGA = "ः";

/** consonant -> Hinglish base */
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "ऩ": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ऱ": "r", "ल": "l", "ळ": "l", "ऴ": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
};
/** consonant + nukta */
const NUKTA_CONS: Record<string, string> = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "d", "ढ": "dh", "फ": "f", "य": "y", "र": "r", "ल": "l", "न": "n" };
/** precomposed nukta letters (NFC keeps some of them decomposed; handle both) */
const PRECOMPOSED: Record<string, string> = { "क़": "क़", "ख़": "ख़", "ग़": "ग़", "ज़": "ज़", "ड़": "ड़", "ढ़": "ढ़", "फ़": "फ़", "य़": "य़", "ऩ": "ऩ", "ऱ": "ऱ", "ऴ": "ऴ" };

type V = "a" | "aa" | "i" | "ii" | "u" | "uu" | "ri" | "li" | "e" | "ai" | "o" | "au";
const MATRA: Record<string, V> = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri", "ॄ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e", "ॊ": "o", "ॆ": "e", "ॏ": "au",
};
const INDEP: Record<string, V> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu", "ऋ": "ri", "ॠ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e", "ऎ": "e", "ऒ": "o", "ॲ": "e", "ऌ": "li",
};
const DIGITS = "०१२३४५६७८९";
const LABIAL = new Set(["p", "ph", "b", "bh", "m", "f"]);

const DEVA_RE = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;
const DEVA_RUN = /[ऀ-ॿ꣠-ꣿ᳐-᳿‌‍]+/g;

export const hasDevanagari = (s: string) => DEVA_RE.test(s);

// ------------------------------------------------------------------ parsing

interface Unit {
  kind: "C" | "V";
  /** consonant letter (base, without nukta) */
  letter?: string;
  nukta?: boolean;
  /** vowel: explicit matra / independent vowel, "schwa" (inherent a), or null (virama: no vowel) */
  vowel: V | "schwa" | null;
  /** schwa deleted by the deletion pass */
  dropped?: boolean;
  nasal?: boolean;
  /** nasal from chandrabindu: vowel nasalization, not a coda ("pahunchna") */
  soft?: boolean;
  visarga?: boolean;
  /** independent vowel letter (V units) */
  indep?: boolean;
}

/** Canonical key: decomposed nukta, no ZW joiners. */
function canon(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) out += PRECOMPOSED[ch] ?? ch;
  return out.replace(/[‌‍]/g, "");
}
/** Looser key for the dictionary: also ignores nukta and chandrabindu/anusvara differences. */
function looseKey(s: string): string {
  return canon(s).replace(/़/g, "").replace(/ँ/g, ANUSVARA);
}

function parse(word: string): Unit[] | null {
  const units: Unit[] = [];
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const last = units[units.length - 1];
    if (CONS[ch] !== undefined) {
      units.push({ kind: "C", letter: ch, vowel: "schwa" });
    } else if (ch === NUKTA) {
      if (last?.kind === "C") last.nukta = true;
    } else if (MATRA[ch]) {
      if (last?.kind === "C" && last.vowel === "schwa") last.vowel = MATRA[ch]!;
      else units.push({ kind: "V", vowel: MATRA[ch]!, indep: true }); // stray matra: read as a vowel
    } else if (ch === VIRAMA) {
      if (last?.kind === "C") last.vowel = null;
    } else if (INDEP[ch]) {
      units.push({ kind: "V", vowel: INDEP[ch]!, indep: true });
    } else if (ch === ANUSVARA || ch === CHANDRABINDU) {
      if (last) {
        last.nasal = true;
        last.soft = ch === CHANDRABINDU;
      } else units.push({ kind: "V", vowel: "a", nasal: true, indep: true });
    } else if (ch === VISARGA) {
      if (last) last.visarga = true;
    } else if (ch === "ॐ") {
      units.push({ kind: "V", vowel: "o", indep: true });
      units.push({ kind: "C", letter: "म", vowel: null });
    } else if (ch === "ऽ" || ch === "‌" || ch === "‍" || ch === "॑" || ch === "॒") {
      // avagraha, joiners, vedic accents: silent
    } else {
      return null; // something we do not model: caller passes it through
    }
  }
  return units;
}

const hasVowel = (u: Unit | undefined) => !!u && (u.kind === "V" || (u.vowel !== null && !u.dropped));

/** Inherent-schwa deletion (word-final + medial VC_CV, right to left). */
function deleteSchwas(u: Unit[]): void {
  const n = u.length;
  const consonants = u.filter((x) => x.kind === "C").length;
  // word-final
  const last = u[n - 1];
  if (last?.kind === "C" && last.vowel === "schwa" && !last.nasal && !last.visarga) {
    const prev = u[n - 2];
    const conjunct = prev?.kind === "C" && prev.vowel === null;
    const keep = n === 1 || consonants === 1 && u[0]?.kind === "C" || (conjunct && ["य", "र", "व"].includes(last.letter!));
    if (!keep) last.dropped = true;
  }
  // medial, right to left: V C(a) C V -> V C C V
  for (let i = n - 2; i >= 1; i--) {
    const c = u[i]!;
    if (c.kind !== "C" || c.vowel !== "schwa" || c.nasal || c.visarga || c.dropped) continue;
    const left = u[i - 1]!;
    const right = u[i + 1]!;
    // the left neighbour must end in a vowel (no coda: nasal/visarga/virama close the syllable)
    if (!(left.kind === "V" || left.vowel !== null) || (left.nasal && !left.soft) || left.visarga) continue;
    if (left.kind === "C" && left.vowel === "schwa" && left.dropped) continue;
    // the right neighbour must be a consonant that carries a vowel
    if (right.kind !== "C" || !hasVowel(right)) continue;
    // y + vowel after a dropped schwa reads badly ("samay" stays, but "karya" etc. are conjunct-written anyway)
    c.dropped = true;
  }
}

// ------------------------------------------------------------------ output

function consonantRoman(u: Unit[], i: number): string {
  const c = u[i]!;
  const L = c.letter!;
  if (c.nukta && NUKTA_CONS[L]) return NUKTA_CONS[L]!;
  const prev = u[i - 1];
  const next = u[i + 1];
  // conjunct specials
  if (L === "ष" && prev?.kind === "C" && prev.letter === "क" && prev.vowel === null) return "sh"; // क्ष -> ksh
  if (L === "ञ" && prev?.kind === "C" && prev.letter === "ज" && prev.vowel === null) return "y"; // ज्ञ -> gy
  if (L === "ज" && c.vowel === null && next?.kind === "C" && next.letter === "ञ") return "g";
  if (L === "च" && c.vowel === null && next?.kind === "C" && next.letter === "छ" && !next.nukta) return ""; // च्छ -> chh ("achha")
  if (L === "च" && c.vowel === null && next?.kind === "C" && next.letter === "च" && !next.nukta) return "c"; // च्च -> cch ("baccha")
  if (L === "छ") {
    if (prev?.kind === "C" && prev.letter === "च" && prev.vowel === null) return "chh";
    return i === 0 ? "chh" : "ch"; // "chhota", but "kuch", "peeche", "pichle"
  }
  if (L === "व") {
    const v = c.vowel;
    return v === "i" || v === "ii" || v === "ri" ? "v" : "w"; // "vishwas", "wajah", "wala", "dwara"
  }
  return CONS[L]!;
}

/** index of the last unit that carries a (kept) vowel */
function lastVowelIndex(u: Unit[]): number {
  for (let i = u.length - 1; i >= 0; i--) if (hasVowel(u[i])) return i;
  return -1;
}

function vowelRoman(u: Unit[], i: number, lastV: number): string {
  const x = u[i]!;
  const v = x.vowel;
  if (v === null || v === "schwa") {
    if (x.dropped || v === null) return "";
    // "eh": schwa + h whose own schwa dropped before a consonant / at the end of a 2-letter word (pehle, kehna, yeh)
    const h = u[i + 1];
    if (x.kind === "C" && h?.kind === "C" && h.letter === "ह" && !h.nukta && (h.vowel === null || h.dropped) && !x.nasal) {
      const after = u[i + 2];
      if (after?.kind === "C" || (i === 0 && u.length === 2)) return "e";
    }
    return "a";
  }
  const final = i === lastV;
  // consonants after this vowel in the same word (closed syllable)
  const closedLast = final && i < u.length - 1;
  const prev = u[i - 1];
  const afterVowel = x.kind === "V" && x.indep && i > 0 && hasVowel(prev) && !prev!.nasal;
  const prevV = afterVowel ? (prev!.vowel === "schwa" ? "a" : prev!.vowel) : null;
  switch (v) {
    case "aa":
      if (x.kind === "V" && i === 0) return "aa"; // aap, aaj, aage
      if (closedLast) return "aa"; // baat, kaam, yaar, pyaar, intezaar
      return "a"; // tha, kya, khana, kahani, zyada, rasta
    case "ii":
      if (x.kind === "V" && i === 0) return "ee";
      return final && !closedLast ? "i" : "ee"; // nahi, bhi, zindagi / theek, neeche, cheez
    case "uu":
      if (x.kind === "V" && i === 0) return "oo";
      return final && !closedLast ? "u" : "oo"; // tu, aalu / zaroor, phool, doosra
    case "e":
      if (afterVowel && prevV !== "u" && prevV !== "uu" && prevV !== "o") return "ye"; // gaye, liye, chahiye, aaye
      return "e";
    default:
      return v;
  }
}

function nasalRoman(u: Unit[], i: number, vowelOut: string, lastV: number): string {
  const next = u.slice(i + 1).find((x) => x.kind === "C");
  const nextBase = next ? consonantRomanSafe(u, u.indexOf(next)) : "";
  if (i === lastV && i === u.length - 1) {
    // word-final nasal vowel
    if (vowelOut === "e" || vowelOut === "ye") return "in"; // mein, hamein, baatein -> "ein"
    return "n";
  }
  return LABIAL.has(nextBase) ? "m" : "n";
}
function consonantRomanSafe(u: Unit[], i: number): string {
  return i >= 0 && u[i]?.kind === "C" ? consonantRoman(u, i) : "";
}

/** Rule-based romanization of one Devanagari run (no dictionary). */
export function romanizeRules(run: string): string {
  const word = canon(run);
  const units = parse(word);
  if (!units) return word.replace(DEVA_RUN, (m) => fallbackChars(m));
  deleteSchwas(units);
  const lastV = lastVowelIndex(units);
  let out = "";
  for (let i = 0; i < units.length; i++) {
    const x = units[i]!;
    if (x.kind === "C") out += consonantRoman(units, i);
    const vo = vowelRoman(units, i, lastV);
    out += vo;
    if (x.nasal) out += nasalRoman(units, i, vo, lastV);
    if (x.visarga) out += "h";
  }
  return out;
}

/** Character-by-character fallback for anything parse() does not model. */
function fallbackChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d >= 0) out += String(d);
    else if (ch === "।" || ch === "॥") out += ".";
    else if (CONS[ch]) out += CONS[ch];
    else if (INDEP[ch]) out += INDEP[ch];
    else if (MATRA[ch]) out += MATRA[ch];
  }
  return out;
}

// ------------------------------------------------------------------ scholarly (ITRANS/Hunterian-like) rendering

const SCHOL_NUKTA: Record<string, string> = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "d", "ढ": "dh", "फ": "f", "य": "y", "र": "r", "ल": "l", "न": "n" };

/**
 * How a scholarly transliterator (or a Whisper model trained on one) writes a Devanagari word: medial schwas kept,
 * ā always "aa" except word-final, च्छ "chchh", व "v", ं "n" ("dekhana", "achchha", "kyonki", "bataane vaala",
 * "nahin", "yah"). Used to build the Roman -> creator-spelling table (hinglish.ts). Returns the canonical form;
 * spelling variants (ee/i, oo/u, aa/a, v/w) are expanded by the caller.
 */
export function romanizeScholarly(run: string): string | null {
  const units = parse(canon(run));
  if (!units) return null;
  const n = units.length;
  const last = units[n - 1];
  if (last?.kind === "C" && last.vowel === "schwa" && !last.nasal && n > 1) {
    const prev = units[n - 2];
    const conjunct = prev?.kind === "C" && prev.vowel === null;
    if (!(conjunct && ["य", "र", "व"].includes(last.letter!))) last.dropped = true;
  }
  const lastV = lastVowelIndex(units);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = units[i]!;
    if (x.kind === "C") {
      const L = x.letter!;
      const next = units[i + 1];
      if (x.nukta && SCHOL_NUKTA[L]) out += SCHOL_NUKTA[L];
      else if (L === "च" && x.vowel === null && next?.kind === "C" && (next.letter === "छ" || next.letter === "च")) out += "ch";
      else if (L === "ष" && units[i - 1]?.letter === "क" && units[i - 1]?.vowel === null) out += "sh";
      else if (L === "ञ" && units[i - 1]?.letter === "ज") out += "y";
      else if (L === "ज" && x.vowel === null && next?.letter === "ञ") out += "g";
      else out += L === "व" ? "v" : CONS[L]!;
    }
    const v = x.vowel;
    let vo = "";
    if (v === "schwa") vo = x.dropped ? "" : "a";
    else if (v === "aa") vo = i === lastV && i === n - 1 ? "a" : "aa";
    else if (v === "ii") vo = "i";
    else if (v === "uu") vo = "oo";
    else if (v !== null) vo = v;
    out += vo;
    if (x.nasal) out += "n";
    if (x.visarga) out += "h";
  }
  return out;
}

/** Iterate the exceptions dictionary (Devanagari key, creator spelling). */
export function* hinglishDictionaryEntries(): Generator<[string, string]> {
  for (const entry of HINGLISH_EXCEPTIONS.split(/\s+/)) {
    const eq = entry.indexOf("=");
    if (eq > 0) yield [entry.slice(0, eq), entry.slice(eq + 1).replace(/_/g, " ")];
  }
}

// ------------------------------------------------------------------ dictionary

let DICT: Map<string, string> | null = null;
function dict(): Map<string, string> {
  if (DICT) return DICT;
  DICT = new Map();
  for (const entry of HINGLISH_EXCEPTIONS.split(/\s+/)) {
    if (!entry) continue;
    const eq = entry.indexOf("=");
    const k = looseKey(entry.slice(0, eq));
    if (!DICT.has(k)) DICT.set(k, entry.slice(eq + 1).replace(/_/g, " "));
  }
  return DICT;
}

/** Romanize one Devanagari run (letters only), dictionary first. */
function romanizeRun(run: string, opts: RomanizeOptions): string {
  const key = looseKey(run);
  if (opts.exceptions) {
    for (const [k, v] of Object.entries(opts.exceptions)) if (looseKey(k) === key) return v;
  }
  if (opts.dictionary !== false) {
    const hit = dict().get(key);
    if (hit !== undefined) return hit;
  }
  return romanizeRules(run);
}

/**
 * Romanize one whitespace-free token: Devanagari runs are romanized, everything else (Latin, digits, punctuation)
 * passes through. Devanagari digits become 0-9, danda becomes ".".
 */
export function romanizeWord(token: string, opts: RomanizeOptions = {}): string {
  if (!hasDevanagari(token)) return token;
  return token.replace(/[०-९]/g, (d) => String(DIGITS.indexOf(d))).replace(/[।॥]/g, ".").replace(DEVA_RUN, (run) => (hasDevanagari(run) ? romanizeRun(run, opts) : ""));
}

/**
 * Romanize text (Devanagari -> Hinglish as creators type it). With no callback, or a synchronous one, the result is a
 * string; when the callback returns a Promise (e.g. an LLM), the result is a Promise. Words with no Devanagari are
 * returned unchanged, and the callback is only asked about words that contain Devanagari (once per distinct word).
 */
export function romanize(text: string, opts?: RomanizeOptions): string;
export function romanize(text: string, opts: RomanizeAsyncOptions): Promise<string>;
export function romanize(text: string, opts: RomanizeOptions | RomanizeAsyncOptions = {}): string | Promise<string> {
  if (!hasDevanagari(text)) return text;
  const parts = text.split(/(\s+)/);
  const words = parts.filter((p, i) => i % 2 === 0 && p);
  const base: RomanizeOptions = { dictionary: opts.dictionary, exceptions: opts.exceptions };
  if (!opts.callback) return parts.map((p, i) => (i % 2 ? p : romanizeWord(p, base))).join("");

  const cb = opts.callback as RomanizeAsyncCallback;
  const asked = new Map<string, unknown>();
  let async = false;
  let wi = -1;
  const built = parts.map((p, i) => {
    if (i % 2 || !p) return { p, builtIn: p, deva: false, index: -1 };
    wi++;
    const builtIn = romanizeWord(p, base);
    const deva = hasDevanagari(p);
    if (deva && !asked.has(p)) {
      const r = cb(p, { builtIn, index: wi, words });
      if (r && typeof (r as Promise<unknown>).then === "function") async = true;
      asked.set(p, r);
    }
    return { p, builtIn, deva, index: wi };
  });
  const pick = (b: (typeof built)[number], r: unknown) => (b.deva && typeof r === "string" && r.trim() ? r : b.builtIn);
  if (!async) return built.map((b, i) => (i % 2 ? b.p : pick(b, asked.get(b.p)))).join("");
  return (async () => {
    const resolved = new Map<string, unknown>();
    for (const [k, v] of asked) {
      try {
        resolved.set(k, await v);
      } catch {
        resolved.set(k, null); // a failing hook never loses the caption: keep the built-in word
      }
    }
    return built.map((b, i) => (i % 2 ? b.p : pick(b, resolved.get(b.p)))).join("");
  })();
}

/** Same as romanize() but always returns a Promise (handy when the hook may or may not be async). */
export async function romanizeAsync(text: string, opts: RomanizeOptions | RomanizeAsyncOptions = {}): Promise<string> {
  return romanize(text, opts as RomanizeAsyncOptions);
}

/** The sync hook normalizeTokens({ romanize }) expects: built-in Devanagari romanizer, other scripts untouched. */
export const builtInRomanize = (text: string): string => romanize(text);

/**
 * Display-time romanization of caption words (settings.romanize): returns the SAME array when nothing changes, so
 * Latin-only tracks are untouched by reference; otherwise a copy with Devanagari words romanized.
 */
export function romanizeWords<T extends { text: string }>(words: T[], opts: RomanizeOptions = {}): T[] {
  if (!words.some((w) => hasDevanagari(w.text))) return words;
  return words.map((w) => (hasDevanagari(w.text) ? { ...w, text: romanize(w.text, opts) } : w));
}
