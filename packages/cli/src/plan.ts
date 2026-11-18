/**
 * planTracks(): propose a multi-look track plan (hook / body / stamps / CTA) for a transcript. Deterministic: the body
 * look is the best recommendLooks pick that can carry a body, the hook and stamp looks come from its pairsWith (else
 * the next best recommendation that fills the slot), one theme for all. The result's `tracks` + `theme` go straight
 * into buildCaptions / caption_video.
 */
import { ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { assignRoles, endsSentence } from "@motion-ai/caption-engine/core";
import { LOOKS } from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { GUIDE } from "./guide";
import { moodOf, pairsFor, slotsFor } from "./meta";
import { recommendLooks } from "./recommend";
import { THEMES, resolveTheme } from "./themes";
import { morphCompatible } from "./tracks";
import type { LookRecommendation, PlanTracksOptions, PlanTracksResult, TrackPlan, TranscriptWord, WordRole } from "./types";

const CTA = /\b(follow|subscribe|like|comment|share|save|link|bio|dm|sign ?up|download|join|click|tap|karo|karna|bhoolna)\b/i;

const bad = (m: string): never => {
  throw new CaptionsEasyError("BAD_ARGS", m);
};

const lookById = (id: string) => LOOKS.find((l) => l.id === id);
const idOf = (n: number) => LOOKS.find((l) => l.number === n)?.id;

export function planTracks(opts: PlanTracksOptions): PlanTracksResult {
  const t = opts?.transcript;
  const list = Array.isArray(t) ? t : (t as { words?: TranscriptWord[] } | undefined)?.words;
  if (!Array.isArray(list) || !list.length) bad("planTracks needs transcript: timed words [{ text, startMs, endMs }] or { words }.");
  const words = (list as TranscriptWord[]).filter((w) => w && typeof w.text === "string" && w.text.trim() && Number.isFinite(w.startMs) && Number.isFinite(w.endMs));
  if (!words.length) bad("planTracks: the transcript has no timed words.");
  const reasons: string[] = [];
  const theme = opts.theme !== undefined ? resolveTheme(opts.theme) : undefined;

  // ---- looks: body first, then its partners
  const recs = recommendLooks({
    transcript: words,
    ...(opts.brief ? { brief: opts.brief } : {}),
    ...(opts.platform ? { platform: opts.platform } : {}),
    ...(theme ? { brand: theme.id } : {}),
    ...(opts.mode ? { mode: opts.mode } : {}),
    limit: 40,
  });
  const has = (r: LookRecommendation, slot: string) => slotsFor(r.id).includes(slot as never);
  const body = recs.find((r) => has(r, "body")) ?? recs[0]!;
  reasons.push(`body: #${body.number} ${body.name}, the best-ranked look that carries running speech (${body.reasons.slice(0, 2).join("; ")})`);
  // a look made from the video picture (knockout, difference) would black out the body under it: never a layer
  const layerable = (id: string | undefined) => !!id && !GUIDE[id]?.footage.needsVideoBehind;
  const partner = (slot: string, not: number[]) => {
    const ok = (id: string | undefined) => (slot === "stamp" ? layerable(id) : true);
    const fromPairs = (body.pairsWith ?? pairsFor(body.id).pairsWith).find((n) => !not.includes(n) && slotsFor(idOf(n) ?? "").includes(slot as never) && ok(idOf(n)));
    if (fromPairs) return { number: fromPairs, why: `pairs with #${body.number}` };
    const r = recs.find((x) => !not.includes(x.number) && has(x, slot) && ok(x.id) && lookById(x.id)?.templateId !== lookById(body.id)?.templateId);
    return r ? { number: r.number, why: `next best ${slot} look for this transcript` } : null;
  };

  // ---- the spans: hook = the opening line, CTA = a closing call to action, body = the rest
  const n = words.length;
  let hookEnd = 0;
  if (n >= 10) {
    // the first sentence when it is short enough, else the longest pause in the first ten words
    const maxHook = Math.min(16, Math.floor(n / 2.5));
    const sentence = words.slice(0, maxHook).findIndex((w, i) => i >= 2 && endsSentence(w.text));
    if (sentence >= 0) hookEnd = sentence + 1;
    else {
      let best = -1;
      for (let i = 2; i < Math.min(10, n - 1); i++) {
        const gap = words[i + 1]!.startMs - words[i]!.endMs + (/[,;:]$/.test(words[i]!.text) ? 200 : 0);
        if (best < 0 || gap > words[best + 1]!.startMs - words[best]!.endMs + (/[,;:]$/.test(words[best]!.text) ? 200 : 0)) best = i;
      }
      hookEnd = best + 1;
    }
  }
  let ctaStart = n;
  let ctaEnd = n;
  if (n >= 14) {
    // the last sentence in the second half that asks for something (follow, subscribe, like karo ...)
    const sentences: [number, number][] = [];
    let from = hookEnd;
    for (let i = hookEnd; i < n; i++) if (endsSentence(words[i]!.text) || i === n - 1) {
      sentences.push([from, i + 1]);
      from = i + 1;
    }
    const hit = sentences.filter(([a, b]) => a >= Math.max(hookEnd + 3, Math.floor(n / 2)) && b - a <= 24 && CTA.test(words.slice(a, b).map((w) => w.text).join(" "))).at(-1);
    if (hit) [ctaStart, ctaEnd] = hit;
  }

  // ---- stamps: figures, names, shouted words; else a handful of key words
  const doc = words.map((w, i) => ({ id: `p${i}`, text: w.text, startMs: w.startMs, endMs: w.endMs })) as Word[];
  const roles = assignRoles(doc, { explicit: words.map((w) => w.role), auto: true, settings: ProjectSettingsSchema.parse({}) });
  const count = (r: WordRole) => roles.filter((x, i) => x === r && i >= hookEnd && (i < ctaStart || i >= ctaEnd)).length;
  const strong: WordRole[] = (["number", "emphasis", "name"] as WordRole[]).filter((r) => count(r) > 0);
  const stampRoles: WordRole[] = strong.length ? strong : count("key") >= 2 ? ["key"] : [];

  const used = [body.number];
  const tracks: TrackPlan[] = [];
  const hook = hookEnd > 0 ? partner("hook", used) : null;
  if (hook) {
    used.push(hook.number);
    tracks.push({ name: "hook", slot: "hook", look: hook.number, words: [0, hookEnd] });
    reasons.push(`hook: #${hook.number} ${lookById(idOf(hook.number) ?? "")?.name} on the opening line (words 0-${hookEnd - 1}), ${hook.why}`);
  }
  const morph = hook ? morphCompatible({ id: idOf(hook.number)!, casing: String(lookById(idOf(hook.number)!)?.style.casing ?? "") }, { id: body.id, casing: String(lookById(body.id)?.style.casing ?? "") }).ok : false;
  tracks.push({ name: "body", slot: "body", look: body.number, rest: true, ...(hook ? { transition: morph ? { type: "morph" } : { type: "exit-entry", overlapMs: 60 } } : {}) });
  if (hook) reasons.push(`hook -> body: ${morph ? "morph (both looks draw plain word text with the same casing)" : "exit-entry (the looks are built differently, so they hand over with the hook's exit and the body's entrance)"}`);
  if (ctaStart < n) {
    const cta = hook ?? partner("hook", used);
    if (cta) {
      tracks.push({ name: "cta", slot: "cta", look: cta.number, words: [ctaStart, ctaEnd], transition: { type: "exit-entry", overlapMs: 60 } });
      reasons.push(`cta: the call to action (words ${ctaStart}-${ctaEnd - 1}) in the hook look, so it stands out like the opening line`);
    }
  }
  if (stampRoles.length) {
    const stamp = partner("stamp", used);
    if (stamp) {
      const span: [number, number] = [hookEnd > 0 ? words[hookEnd]!.startMs : 0, ctaStart < n && ctaEnd === n ? words[ctaStart]!.startMs : words[n - 1]!.endMs + 1];
      tracks.push({ name: "stamps", slot: "stamp", look: stamp.number, role: stampRoles, time: span, position: "top" });
      reasons.push(`stamps: #${stamp.number} ${lookById(idOf(stamp.number) ?? "")?.name} over the body for ${stampRoles.join(" / ")} words (${stampRoles.reduce((s, r) => s + count(r), 0)}), ${stamp.why}`);
    }
  }

  // ---- theme: the caller's, else the named theme whose mood matches the body look
  let themeId = theme?.id;
  if (!themeId) {
    const g = GUIDE[body.id];
    const mood = g ? moodOf(g) : undefined;
    const script = words.some((w) => /[ऀ-ॿ]/.test(w.text)) ? "devanagari" : "latin";
    const pick = THEMES.find((x) => x.mood === mood && x.scripts.includes(script as never)) ?? THEMES.find((x) => x.scripts.includes(script as never)) ?? THEMES[0]!;
    themeId = pick.id;
    reasons.push(`theme: ${pick.name} (${pick.mood}${pick.mood === mood ? ", the body look's mood" : ""})`);
  }
  return { theme: themeId, tracks, reasons, looks: tracks.map((x) => ({ track: x.name!, number: x.look as number, id: idOf(x.look as number) ?? "", name: lookById(idOf(x.look as number) ?? "")?.name ?? "" })) };
}
