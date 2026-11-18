/**
 * Languages: Devanagari -> Hinglish romanizer, script detection and per-look script support.
 * Standalone module (not yet exported from index.ts): see docs/NOTES-lang-safety.md for the wiring.
 * Everything here is pure and bundled at build time (zero runtime dependencies).
 */
import { detectScript, hinglishSpelling, hinglishSpellingWords, romanize, romanizeAsync, romanizeWord, scriptsOf, scriptsOfWords, type RomanizeAsyncCallback, type RomanizeCallback, type RomanizeOptions } from "@motion-ai/caption-engine/core";
import { DEVANAGARI_FONTS, LATIN_ONLY_TEMPLATES, NATIVE_DEVANAGARI, devanagariPartner, getFontEntry, lookScriptSupport, type ScriptSupport } from "@capseasy/templates";
import { resolveLook } from "./looks";

export { hinglishSpelling, hinglishSpellingWords, romanize, romanizeAsync, romanizeWord, detectScript, scriptsOf, scriptsOfWords, DEVANAGARI_FONTS, NATIVE_DEVANAGARI, LATIN_ONLY_TEMPLATES };
export type { RomanizeCallback, RomanizeAsyncCallback, RomanizeOptions, ScriptSupport };
export type { Script, WordScript, RomanizeWordContext, HinglishSpellingOptions, HinglishRewrite } from "@motion-ai/caption-engine/core";

interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Romanize transcript words (Devanagari -> Hinglish). Timings and every other field are kept; words with no Devanagari
 * are returned as the same objects. With an async callback (e.g. an LLM) the result is a Promise.
 */
export function romanizeTranscript<W extends TimedWord>(words: W[], opts?: { callback?: RomanizeCallback; dictionary?: boolean; exceptions?: Record<string, string> }): W[];
export function romanizeTranscript<W extends TimedWord>(words: W[], opts: { callback: RomanizeAsyncCallback; dictionary?: boolean; exceptions?: Record<string, string> }): Promise<W[]>;
export function romanizeTranscript<W extends TimedWord>(words: W[], opts: { callback?: RomanizeAsyncCallback; dictionary?: boolean; exceptions?: Record<string, string> } = {}): W[] | Promise<W[]> {
  // romanize the whole track in one call so the hook sees each distinct word once, with context
  const DEVA = /[ऀ-ॿ]/;
  const idx = words.map((w, i) => (DEVA.test(w.text) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return words;
  // inner spaces of a word ride through as a private-use char so one word stays one token
  const PUA = String.fromCharCode(0xe000);
  const tokens = idx.map((i) => words[i]!.text.trim().replace(/\s+/g, PUA));
  const apply = (joined: string) => {
    const out = joined.split(" ");
    const copy = words.slice();
    idx.forEach((i, k) => (copy[i] = { ...words[i]!, text: (out[k] ?? words[i]!.text).split(PUA).join(" ") }));
    return copy;
  };
  const r = romanize(tokens.join(" "), opts as RomanizeOptions);
  return typeof r === "string" ? apply(r) : (r as Promise<string>).then(apply);
}

/** Which scripts a look draws natively, which through a fallback font, and which it cannot shape. */
export function lookScripts(look: string | number): ScriptSupport & { look: { number: number; id: string; name: string } } {
  const def = resolveLook(look);
  return { ...lookScriptSupport(def), look: { number: def.number ?? 0, id: def.id, name: def.name } };
}

/** The Devanagari font that draws Devanagari words for a look font (itself when it has the glyphs). */
export function devanagariFontFor(fontId: string): string {
  return devanagariPartner(fontId, getFontEntry(fontId)?.category);
}
