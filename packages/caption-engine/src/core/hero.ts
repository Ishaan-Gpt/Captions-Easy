import type { Emotion, Word } from "@capseasy/shared";

const STOP_EN = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "and", "in", "on", "at", "it", "this", "that", "i", "you", "he",
  "she", "we", "they", "but", "or", "so", "be", "as", "for", "with", "my", "your", "do", "does", "did", "its", "im", "just",
]);
// romanized Hindi / Hinglish function words
const STOP_HI = new Set([
  "hai", "hain", "ho", "tha", "thi", "the", "ka", "ki", "ke", "ko", "se", "me", "mein", "main", "mai", "hum", "aur", "ye",
  "yeh", "wo", "woh", "toh", "to", "bhi", "kya", "nahi", "nahin", "par", "pe", "ek", "is", "us", "kuch", "koi", "jo",
]);

const clean = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "");

/** Index (into `words`) of the most impactful word on a card. Never returns a hidden word unless all are hidden. */
export function pickHeroIndex(words: Word[]): number {
  const userHero = words.findIndex((w) => w.emphasis === "hero" && !w.hidden);
  if (userHero !== -1) return userHero;
  const legacyManual = words.findIndex((w) => w.emphasis === "strong" && !w.hidden);
  if (legacyManual !== -1) return legacyManual;

  let best = 0;
  let bestScore = -Infinity;
  words.forEach((w, i) => {
    const c = clean(w.text);
    if (!c || w.hidden) return;
    const lower = c.toLowerCase();
    let score = c.length;
    if (STOP_EN.has(lower) || STOP_HI.has(lower)) score -= 100;
    if (/^\p{Lu}/u.test(c) && i > 0) score += 2;
    if (/\d/.test(c)) score += 3;
    if (c.length > 2 && c === c.toUpperCase() && /\p{L}/u.test(c)) score += 3;
    if (/[!?]$/.test(w.text)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

// ---- heuristic emotion (offline fallback; LLM enrich overrides with source:"ai") ----
const LEX: Record<Exclude<Emotion, "neutral" | "question" | "hype" | "calm">, RegExp> = {
  funny: /\b(ha(ha)+|lol|lmao|rofl|funny|hilarious|joke|kidding|bhai|pagal|hasi)\b/i,
  angry: /\b(hate|angry|furious|stupid|idiot|worst|terrible|garbage|annoying|gussa|bakwas)\b/i,
  sad: /\b(sad|sorry|cry|crying|lost|miss|alone|hurt|died|dukh|rona)\b/i,
  surprised: /\b(wow|omg|whoa|unbelievable|shocking|can't believe|cannot believe|no way|kya baat)\b/i,
  excited: /\b(amazing|awesome|incredible|love|best|great|fantastic|epic|insane|crazy|zabardast|mast)\b/i,
  serious: /\b(important|warning|careful|serious|critical|never|must|danger|dhyan)\b/i,
};

export function detectEmotion(text: string): Emotion {
  const t = text.trim();
  if (!t) return "neutral";
  if (/\?\s*$/.test(t)) return "question";
  for (const key of ["funny", "angry", "sad", "surprised", "excited", "serious"] as const) {
    if (LEX[key].test(t)) return key;
  }
  if (/!\s*$/.test(t)) return "excited";
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) return "hype";
  return "neutral";
}
