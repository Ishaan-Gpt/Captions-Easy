/**
 * Writing-script detection per word, so a renderer can tell whether a look's font can draw a caption and which
 * fallback font a word needs. Pure, zero-dependency, deterministic.
 */
export type Script =
  | "latin" | "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "oriya" | "tamil" | "telugu" | "kannada" | "malayalam"
  | "arabic" | "hebrew" | "cyrillic" | "greek" | "thai" | "han" | "kana" | "hangul";

/** Scripts a word can be written in, plus "common" for digits, punctuation, emoji and other script-neutral text. */
export type WordScript = Script | "common";

const RANGES: [number, number, Script][] = [
  [0x0041, 0x005a, "latin"], [0x0061, 0x007a, "latin"], [0x00c0, 0x024f, "latin"], [0x1e00, 0x1eff, "latin"],
  [0x0370, 0x03ff, "greek"], [0x0400, 0x052f, "cyrillic"],
  [0x0590, 0x05ff, "hebrew"], [0x0600, 0x06ff, "arabic"], [0x0750, 0x077f, "arabic"], [0x08a0, 0x08ff, "arabic"], [0xfb50, 0xfdff, "arabic"], [0xfe70, 0xfeff, "arabic"],
  [0x0900, 0x097f, "devanagari"], [0xa8e0, 0xa8ff, "devanagari"], [0x1cd0, 0x1cff, "devanagari"],
  [0x0980, 0x09ff, "bengali"], [0x0a00, 0x0a7f, "gurmukhi"], [0x0a80, 0x0aff, "gujarati"], [0x0b00, 0x0b7f, "oriya"],
  [0x0b80, 0x0bff, "tamil"], [0x0c00, 0x0c7f, "telugu"], [0x0c80, 0x0cff, "kannada"], [0x0d00, 0x0d7f, "malayalam"],
  [0x0e00, 0x0e7f, "thai"], [0x3040, 0x30ff, "kana"], [0x3400, 0x4dbf, "han"], [0x4e00, 0x9fff, "han"], [0xac00, 0xd7af, "hangul"], [0x1100, 0x11ff, "hangul"],
];

/** Script of one code point ("common" for digits, punctuation, symbols, emoji, combining marks outside a script block). */
export function scriptOfChar(ch: string): WordScript {
  const cp = ch.codePointAt(0)!;
  // danda/double danda are shared by the Indic scripts, Devanagari digits are Devanagari
  for (const [a, b, s] of RANGES) if (cp >= a && cp <= b) return s;
  return "common";
}

/**
 * Dominant script of a word: the script with the most letters ("common" when there are none). Mixed tokens such as
 * "वीडियो-wala" report the majority; use scriptsOf() for all of them.
 */
export function detectScript(word: string): WordScript {
  const counts = new Map<Script, number>();
  for (const ch of word) {
    const s = scriptOfChar(ch);
    if (s !== "common") counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: WordScript = "common";
  let n = 0;
  for (const [s, c] of counts) if (c > n) [best, n] = [s, c];
  return best;
}

/** Every script used in a text (no "common"), in first-seen order. */
export function scriptsOf(text: string): Script[] {
  const seen: Script[] = [];
  for (const ch of text) {
    const s = scriptOfChar(ch);
    if (s !== "common" && !seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** Scripts used across many words (e.g. a whole caption track). */
export function scriptsOfWords(words: { text: string }[]): Script[] {
  const seen = new Set<Script>();
  for (const w of words) for (const s of scriptsOf(w.text)) seen.add(s);
  return [...seen];
}
