import type { CaptionDoc, Word } from "@capseasy/shared";

/** Keyword -> emoji. Matched against the lower-cased word with punctuation removed (simple plural/-ing stems too). */
const MAP: Record<string, string> = {
  money: "💰", cash: "💵", rich: "🤑", dollar: "💵", dollars: "💵", paisa: "💰", paise: "💰", rupees: "💸", price: "🏷️", sale: "🏷️", profit: "📈", growth: "📈", sales: "📈",
  fire: "🔥", hot: "🔥", lit: "🔥", insane: "🤯", crazy: "🤪", mindblowing: "🤯", wow: "😮", omg: "😱", shocking: "😱", secret: "🤫",
  love: "❤️", heart: "❤️", pyaar: "❤️", happy: "😊", sad: "😢", cry: "😭", angry: "😠", laugh: "😂", funny: "😂", lol: "😂", haha: "😂",
  idea: "💡", tip: "💡", hack: "🧠", brain: "🧠", smart: "🧠", learn: "📚", book: "📚", school: "🏫", study: "📚",
  time: "⏰", fast: "⚡", quick: "⚡", speed: "⚡", now: "⏱️", today: "📅", tomorrow: "📅", night: "🌙", morning: "🌅",
  win: "🏆", winner: "🏆", best: "🏆", champion: "🏆", goal: "🎯", target: "🎯", success: "🚀", launch: "🚀", rocket: "🚀", grow: "🌱",
  food: "🍔", eat: "🍽️", pizza: "🍕", coffee: "☕", chai: "☕", tea: "🍵", water: "💧", gym: "💪", strong: "💪", workout: "🏋️", health: "🩺",
  phone: "📱", video: "🎬", camera: "📷", music: "🎵", song: "🎶", game: "🎮", code: "💻", computer: "💻", ai: "🤖", robot: "🤖", internet: "🌐",
  business: "💼", work: "💼", job: "💼", boss: "😎", team: "🤝", deal: "🤝", client: "🤝", clients: "🤝", customer: "🛍️", buy: "🛒", shop: "🛍️",
  travel: "✈️", world: "🌍", home: "🏠", car: "🚗", friend: "🫂", family: "👨‍👩‍👧", baby: "👶", dog: "🐶", cat: "🐱",
  yes: "✅", correct: "✅", right: "✅", no: "❌", wrong: "❌", stop: "🛑", warning: "⚠️", danger: "⚠️", question: "❓", why: "🤔", think: "🤔",
  free: "🆓", new: "✨", magic: "✨", easy: "👌", perfect: "👌", cool: "😎", king: "👑", queen: "👑", star: "⭐", number: "🔢", first: "🥇",
};

const stem = (w: string) => {
  const c = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (MAP[c]) return c;
  for (const suf of ["ing", "ed", "es", "s"]) if (c.endsWith(suf) && MAP[c.slice(0, -suf.length)]) return c.slice(0, -suf.length);
  return c;
};

export const emojiFor = (text: string): string | null => MAP[stem(text)] ?? null;

/**
 * Suggest emoji for keywords, at most one every `minGapMs` so the video doesn't turn into an emoji wall.
 * Never touches words where the user chose (or removed) an emoji.
 */
export function autoEmoji(doc: CaptionDoc, opts: { minGapMs?: number; position?: "above" | "after" | "before" } = {}): CaptionDoc {
  const gap = opts.minGapMs ?? 2500;
  let lastAt = -Infinity;
  const words = doc.words.map((w): Word => {
    if (w.source?.emoji === "user" || w.hidden) {
      if (w.emoji) lastAt = w.startMs;
      return w;
    }
    const e = emojiFor(w.text);
    if (e && w.startMs - lastAt >= gap) {
      lastAt = w.startMs;
      return { ...w, emoji: { char: e, position: opts.position ?? "above" }, source: { ...w.source, emoji: "ai" } };
    }
    return w.source?.emoji === "ai" ? { ...w, emoji: null, source: { ...w.source, emoji: undefined } } : w;
  });
  return { ...doc, words };
}

/** Remove every automatically added emoji (user-chosen ones stay). */
export function clearAutoEmoji(doc: CaptionDoc): CaptionDoc {
  return { ...doc, words: doc.words.map((w) => (w.source?.emoji === "ai" ? { ...w, emoji: null, source: { ...w.source, emoji: undefined } } : w)) };
}
