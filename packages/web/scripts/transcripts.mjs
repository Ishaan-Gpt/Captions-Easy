/** Sample transcripts for caption audits and stills: natural speech with short and long words, a number, a pause. */
export const TRANSCRIPTS = {
  talk: "So here is the thing nobody tells you about growing on YouTube. You need 3 videos a week, consistently, for a whole year.",
  hook: "Stop scrolling. This one money trick saved me $4,000 last month and honestly it changed everything.",
};
/** words timed like speech at `wpm`: longer words take longer, punctuation adds a pause */
export function timed(sentence, wpm = 160) {
  const per = 60000 / wpm;
  let t = 200;
  return sentence.split(/\s+/).filter(Boolean).map((w) => {
    const dur = Math.max(160, Math.min(520, per * (0.55 + w.length / 12)));
    const word = { text: w, startMs: Math.round(t), endMs: Math.round(t + dur) };
    t += dur + (/[.,!?]$/.test(w) ? 320 : 40);
    return word;
  });
}
