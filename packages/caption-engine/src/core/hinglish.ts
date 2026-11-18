/**
 * Roman -> creator-spelling normalizer for romanized Hindi ("Hinglish spelling").
 *
 * Whisper-style Hinglish models write Hindi in a scholarly romanization ("yah video end tak zaroor dekhana kyonki ...
 * achchha hai", "ham", "nahin", "bataane vaala"). Creators type "yeh video end tak zaroor dekhna kyunki ... achha
 * hai", "hum", "nahi", "batane wala". This module rewrites the first into the second, word by word:
 *
 *   1. a table scholarly -> creator, generated from Devanagari: every exceptions-dictionary word plus a list of
 *      frequent words and productive verb forms is rendered the scholarly way (romanizeScholarly + spelling variants
 *      ee/i, oo/u, aa/a, v/w, chchh/chh, schwa kept/dropped) and mapped to the creator spelling (romanize()).
 *   2. a Hindi-context window: a table hit whose scholarly form is ALSO an English word ("ham", "yah", "men", "door",
 *      "bus") is rewritten only when the surrounding words are romanized Hindi (>= 2 Hindi function/lexicon words
 *      within 3 tokens and more Hindi than English evidence). Words that are not Hindi in the table are never touched,
 *      so English in code-mixed speech ("battery backup", "content", "subscribe") passes through unchanged.
 *   3. capitalization and punctuation of each token are preserved.
 * Pure, deterministic, zero dependencies.
 */
import { STOP_EN, STOP_HI } from "./hero";
import { hinglishDictionaryEntries, romanize, romanizeScholarly } from "./romanize";

/** frequent Hindi words beyond the exceptions dictionary (Devanagari), used to grow the table */
const EXTRA_WORDS = `
पिछले पिछला पिछली अगले अगला अगली महीने महीना हफ़्ते हफ्ते हफ़्ता घंटे घंटा मिनट सेकंड सुबह शाम दोपहर
बताने बताना बताओ बताया बताई बताते बताता बताती खरीदा खरीदी खरीदे खरीदना खरीदने
आसान मुश्किल ज़रूरत ज़रूरी पसंद नापसंद कमाल शानदार मज़ेदार ख़ास खास बेकार बढ़िया घटिया सस्ता महंगा
सच्चाई सपने उम्मीद भरोसा कोशिश मेहनत किस्मत हिम्मत ताक़त कमज़ोर मज़बूत तैयार परेशान हैरान
दिखाओ दिखाना दिखाया दिखाता सिखाना सिखाया समझाना समझाया बचाना बचाया लगाना लगाया उठाना उठाया
जल्दी धीरे अचानक शायद हमेशा कभी अभी सभी तभी यहीं वहीं कहीं अंदर बाहर ऊपर नीचे आगे पीछे पास दूर
इतना इतनी इतने उतना जितना कितना कितनी कितने जैसे वैसे ऐसा ऐसी ऐसे वैसा वैसी कैसा कैसी कैसे
अपना अपनी अपने हमारा हमारी हमारे तुम्हारा तुम्हारी तुम्हारे उनका उनकी उनके इनका इनकी इनके
किसका किसकी किसके जिसका जिसकी जिसके जिसने जिसको उसको इसको किसको सबको
दोस्त दोस्तों भाई भाइयों बहन बहनों लोग लोगों बच्चे बच्चों घर दुकान बाज़ार शहर गाँव देश दुनिया
पानी खाना चाय दूध रोटी सब्ज़ी मिठाई चाट नाश्ता
`;

/** verb stems (Devanagari) and the forms generated from them */
const VERB_STEMS = `देख कर बोल भूल समझ चल रह सीख लिख पढ़ खेल बैठ उठ मिल बदल सोच छोड़ पूछ जीत हार लग बन रख भेज मान जान चाह सक पहुँच ख़रीद बेच गिर डर सुन मार निकल पकड़ बढ़ घूम दौड़ हँस रुक`;
const VOWEL_STEMS = `बता दिखा सिखा समझा बचा लगा उठा बना ला जा आ खा पी दे ले गा`;
const C_SUFFIXES = ["ना", "ने", "नी", "ता", "ते", "ती", "ा", "े", "ी", "ो", "ेगा", "ेगी", "ेंगे", "ूँगा", "कर", "िए", "िये", "ो"];
const V_SUFFIXES = ["ना", "ने", "नी", "ता", "ते", "ती", "या", "ये", "यी", "ई", "ओ", "एगा", "एगी", "एंगे", "ऊँगा", "कर", "इए", "इये"];

/** common English words: a table key that is one of these is "ambiguous" and needs Hindi context */
const ENGLISH = new Set(
  `a about after again all also am an and any are as at back be because been before being best big both but by came can come could day did do does done door down each even every few find first for from get give go going good got great had has have he her here him his how i if in into is it its just know last let life like little long look made make man many may me men more most much must my name never new next no not now of off old on one only or other our out over own part people place put really right said same saw say see she should show side small so some still such take than that the their them then there these they thing think this those time to too two under up us use very want was way we well went were what when where which while who why will with without word work world would year yes yet you your
  ham yah bus log par door sale main mat raw run ban band man car dam dear deer mere sure pure hum dill jab job tab tag tar bat bad to the he hi ho na ne lo do pal`.split(/\s+/).filter(Boolean),
);

/** romanized Hindi function words that are NOT English words: strong Hindi evidence */
const HINDI_EVIDENCE_BASE = [
  "hai", "hain", "tha", "thi", "ka", "ki", "ke", "ko", "se", "mein", "nahi", "nahin", "kya", "kyun", "kyon", "kyunki", "kyonki", "aur", "bhi", "toh",
  "yeh", "woh", "hoon", "hu", "hun", "aap", "aapko", "aapka", "aapki", "mujhe", "tujhe", "humein", "hamein", "unka", "uska", "iska", "isko", "usko", "raha", "rahi",
  "rahe", "karo", "karna", "karte", "karta", "karti", "kiya", "gaya", "gayi", "hota", "hoti", "hoga", "hogi", "bahut", "achha", "achchha", "accha", "tak", "liye",
  "lekin", "agar", "jo", "kuch", "koi", "ek", "yaar", "bhai", "matlab", "abhi", "kabhi", "sab", "aaj", "kal", "wala", "vaala", "waala", "wali", "vaali",
];

let TABLE: Map<string, string> | null = null;
let HINDI: Set<string> | null = null;
/** English-looking words that are also creator spellings of Hindi words (log, par, the, main ...) */
const CREATOR_EN = new Set<string>();

const VOWELS = /[aeiou]/;
/** spelling variants of one scholarly form */
function variants(s: string): Set<string> {
  let out = new Set([s]);
  const step = (re: RegExp, to: string) => {
    const next = new Set(out);
    for (const v of out) next.add(v.replace(re, to));
    out = next;
  };
  step(/chchh/g, "chh");
  step(/chchh/g, "cchh");
  step(/ee/g, "i");
  step(/(?<=[^aeiou])i(?=[^aeiou])/g, "ee");
  step(/oo/g, "u");
  step(/(?<=[^aeiou])u(?=[^aeiou])/g, "oo");
  step(/(?<=.)aa/g, "a");
  step(/^v/g, "w");
  step(/(?<=[aeiou])v(?=[aeiou])/g, "w");
  step(/n$/g, "");
  return out;
}

function build(): void {
  /** scholarly form -> [creator, priority]; canonical scholarly (2) beats plain-rules variants (1) beats expansions (0) */
  const best = new Map<string, [string, number]>();
  const clash = new Set<string>();
  const hindi = new Set<string>(HINDI_EVIDENCE_BASE);
  const creators = new Set<string>();
  const allCreators = new Set<string>();
  const put = (form: string, creator: string, prio: number) => {
    if (!form || !VOWELS.test(form)) return;
    if (!ENGLISH.has(form)) hindi.add(form);
    if (form === creator) return;
    const prev = best.get(form);
    if (!prev || prev[1] < prio) {
      best.set(form, [creator, prio]);
      clash.delete(form);
    } else if (prev[1] === prio && prev[0] !== creator) clash.add(form);
  };
  const add = (deva: string, creator: string, frequent: boolean) => {
    if (/\s/.test(creator) || !/^[a-z]+$/.test(creator)) return;
    if (frequent) creators.add(creator);
    allCreators.add(creator);
    if (!ENGLISH.has(creator)) hindi.add(creator);
    else CREATOR_EN.add(creator);
    const sch = romanizeScholarly(deva);
    const rules = romanize(deva, { dictionary: false });
    if (sch) put(sch, creator, 2);
    put(rules, creator, 1);
    for (const base of [sch, rules]) if (base) for (const v of variants(base)) put(v, creator, 0);
  };
  for (const [deva, creator] of hinglishDictionaryEntries()) add(deva, creator, true);
  const extra = [...EXTRA_WORDS.split(/\s+/).filter(Boolean)];
  for (const s of VERB_STEMS.split(/\s+/)) {
    extra.push(s);
    for (const suf of C_SUFFIXES) extra.push(s + suf);
  }
  for (const s of VOWEL_STEMS.split(/\s+/)) {
    extra.push(s);
    for (const suf of V_SUFFIXES) extra.push(s + suf);
  }
  for (const w of extra) add(w, romanize(w), false);
  const table = new Map<string, string>();
  for (const [form, [creator]] of best) if (!clash.has(form)) table.set(form, creator);
  // a scholarly form that is itself a frequent word's creator spelling stays as it is ("the" for थे, "rahe")
  for (const creator of allCreators) if (creators.has(creator) || (best.get(creator)?.[1] ?? 0) < 2) table.delete(creator);
  // hand-picked fixes the generator cannot see (model habits)
  for (const [k, v] of Object.entries(MANUAL)) table.set(k, v);
  for (const k of Object.keys(MANUAL)) if (!ENGLISH.has(k)) hindi.add(k);
  TABLE = table;
  HINDI = hindi;
}

/** model habits that are not plain transliteration variants */
const MANUAL: Record<string, string> = {
  yah: "yeh", vah: "woh", vo: "wo", ham: "hum", hamen: "humein", hamein: "humein", tumhen: "tumhe", unhen: "unhe", inhen: "inhe",
  mainne: "maine", nahin: "nahi", kyonki: "kyunki", kyon: "kyun", kyoon: "kyun", achchha: "achha", achchhi: "achhi", achchhe: "achhe",
  men: "mein", hun: "hoon", yahaan: "yahan", vahaan: "wahan", kahaan: "kahan", jahaan: "jahan", vaala: "wala", vaale: "wale", vaali: "wali",
};

export interface HinglishSpellingOptions {
  /** tokens either side that form the Hindi context window (default 4) */
  window?: number;
  /** minimum Hindi evidence words in the window for ambiguous rewrites (default 2) */
  minHindi?: number;
  /** extra/overriding rewrites { scholarly: creator } (lower-case keys) */
  extra?: Record<string, string>;
}

const core = (t: string) => {
  const m = /^([^\p{L}]*)([\p{L}']+)([^\p{L}]*)$/u.exec(t);
  return m ? { pre: m[1]!, word: m[2]!, post: m[3]! } : null;
};
const matchCase = (src: string, out: string) => (src === src.toUpperCase() && src.length > 1 ? out.toUpperCase() : /^\p{Lu}/u.test(src) ? out[0]!.toUpperCase() + out.slice(1) : out);

export interface HinglishRewrite {
  index: number;
  from: string;
  to: string;
  /** "table": unambiguous Hindi form; "context": English-looking form rewritten because its neighbours are Hindi */
  why: "table" | "context";
}

/**
 * Rewrite scholarly romanized Hindi tokens into creator spelling. `tokens` are words (any punctuation attached); the
 * result has the same length and order. Non-Hindi tokens are returned unchanged.
 */
export function hinglishSpellingTokens(tokens: string[], opts: HinglishSpellingOptions = {}, rewrites?: HinglishRewrite[]): string[] {
  if (!TABLE) build();
  const table = TABLE!;
  const hindi = HINDI!;
  const win = opts.window ?? 4;
  const minHindi = opts.minHindi ?? 2;
  const words = tokens.map((t) => core(t)?.word.toLowerCase() ?? "");
  const isHindi = (w: string) => !!w && !ENGLISH.has(w) && !STOP_EN.has(w) && (hindi.has(w) || STOP_HI.has(w));
  // words that are both ("to", "the", "main", "log", "par") count for neither side
  const isEnglish = (w: string) => !!w && (STOP_EN.has(w) || ENGLISH.has(w)) && !hindi.has(w) && !STOP_HI.has(w) && !CREATOR_EN.has(w) && !table.has(w);
  const evidence = (i: number) => {
    let h = 0;
    let e = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(words.length - 1, i + win); j++) {
      if (j === i) continue;
      if (isHindi(words[j]!)) h++;
      else if (isEnglish(words[j]!)) e++;
    }
    return { h, e };
  };
  return tokens.map((tok, i) => {
    const c = core(tok);
    if (!c) return tok;
    const w = words[i]!;
    const to = opts.extra?.[w] ?? table.get(w);
    if (to === undefined || to === w) return tok;
    const ambiguous = ENGLISH.has(w) || STOP_EN.has(w);
    const { h, e } = evidence(i);
    // an English-looking form ("ham", "yah", "men") needs clear Hindi around it; a form that is not English
    // ("dekhana", "kyonki") only needs the neighbourhood not to be English
    const ok = ambiguous ? (h >= minHindi && h > e) || (h >= 1 && e === 0) : h >= e;
    if (!ok) return tok;
    const out = c.pre + matchCase(c.word, to) + c.post;
    rewrites?.push({ index: i, from: tok, to: out, why: ambiguous ? "context" : "table" });
    return out;
  });
}

/** Rewrite a text (whitespace preserved). */
export function hinglishSpelling(text: string, opts: HinglishSpellingOptions = {}): string {
  const parts = text.split(/(\s+)/);
  const idx: number[] = [];
  const toks: string[] = [];
  parts.forEach((p, i) => {
    if (i % 2 === 0 && p) {
      idx.push(i);
      toks.push(p);
    }
  });
  const out = hinglishSpellingTokens(toks, opts);
  idx.forEach((pi, k) => (parts[pi] = out[k]!));
  return parts.join("");
}

/** Rewrite timed words (one token each); returns the same array when nothing changes. */
export function hinglishSpellingWords<T extends { text: string }>(words: T[], opts: HinglishSpellingOptions = {}): T[] {
  const out = hinglishSpellingTokens(words.map((w) => w.text), opts);
  let changed = false;
  const res = words.map((w, i) => {
    if (out[i] === w.text) return w;
    changed = true;
    return { ...w, text: out[i]! };
  });
  return changed ? res : words;
}

/**
 * How much of a token list is romanized Hindi: words that are Hindi by the creator-spelling table and not also English
 * ("to", "the", "main", "me", "so" count for neither side), plus clear English words. Used to tell Hinglish from English.
 */
export function hinglishEvidence(tokens: string[]): { hindi: number; english: number; distinctHindi: number; total: number } {
  if (!TABLE) build();
  const hindi = HINDI!;
  const words = tokens.map((t) => core(t)?.word.toLowerCase() ?? "").filter(Boolean);
  const isHindi = (w: string) => !ENGLISH.has(w) && !STOP_EN.has(w) && (hindi.has(w) || STOP_HI.has(w) || TABLE!.has(w));
  const isEnglish = (w: string) => (STOP_EN.has(w) || ENGLISH.has(w)) && !isHindi(w);
  const hi = words.filter(isHindi);
  return { hindi: hi.length, english: words.filter(isEnglish).length, distinctHindi: new Set(hi).size, total: words.length };
}
