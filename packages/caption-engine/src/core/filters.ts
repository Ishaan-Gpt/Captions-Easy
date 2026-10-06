import type { CaptionDoc } from "@capseasy/shared";

export const DEFAULT_FILLERS = ["um", "uh", "uhm", "umm", "er", "erm", "ah", "hmm", "hm", "mhm", "uhh", "ehh", "arre"];

const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Hide filler words (kept in the doc so timing is preserved and the action is reversible). */
export function applyFillerFilter(doc: CaptionDoc, list: string[] = DEFAULT_FILLERS, enabled = true): CaptionDoc {
  const set = new Set(list.map((f) => f.toLowerCase()));
  const words = doc.words.map((w) => {
    if (w.source?.text === "user") return w; // never override a user edit
    const isFiller = set.has(bare(w.text));
    if (enabled) return isFiller && !w.hidden ? { ...w, hidden: true, source: { ...w.source, filler: true } } : w;
    return w.hidden && w.source?.filler ? { ...w, hidden: false, source: { ...w.source, filler: false } } : w;
  });
  return { ...doc, words };
}

const PROFANE = ["fuck", "fucking", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "bullshit", "motherfucker", "damn"];
const PROFANE_SET = new Set(PROFANE);

export const isProfane = (text: string) => PROFANE_SET.has(bare(text));

export function maskWord(text: string): string {
  const core = text.replace(/[^\p{L}\p{N}']/gu, "");
  if (core.length <= 1) return text;
  const masked = core[0] + "*".repeat(core.length - 1);
  return text.replace(core, masked);
}

export type ProfanityMode = "off" | "mask" | "emoji" | "hide";

/** Display-time transform: returns the doc with profane words masked/hidden/emoji'd. Does not mutate stored text. */
export function applyProfanity(doc: CaptionDoc, mode: ProfanityMode): CaptionDoc {
  if (mode === "off") return doc;
  const words = doc.words.map((w) => {
    if (!isProfane(w.text)) return w;
    if (mode === "hide") return { ...w, hidden: true };
    // "emoji" mode is retired while emoji are switched off: projects that chose it get masked words
    return { ...w, text: maskWord(w.text) };
  });
  return { ...doc, words };
}
