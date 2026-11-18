/**
 * recommendLooks(): rank the gallery looks for a described video, deterministically (no model, no network).
 *
 * Inputs are normalised to the guide's fixed vocabularies (with common synonyms: "podcast" -> podcast-clip,
 * "luxury" -> fashion-luxury + premium/elegant, "calm" -> minimal/elegant + low energy ...). A free-text `query`
 * is parsed the same way, and any words left over are matched against each look's summary, name and tags.
 */
import { CaptionsEasyError } from "./errors";
import { hinglishEvidence } from "@motion-ai/caption-engine/core";
import { lookScriptSupport } from "@capseasy/templates";
import { isColor } from "./captions";
import { CONTENT_TYPES, PACES, PLATFORMS, TONES, guideFor } from "./guide";
import { describeLook, listLooks } from "./looks";
import { roleSupport } from "./roles";
import { resolveTheme } from "./themes";
import type { ContentType, FootageKind, LookGuide, LookMood, LookRecommendation, LookSummary, Pace, Platform, RecommendLooksOptions, Script, ThemeRef, Tone, TranscriptAnalysis, TranscriptWord } from "./types";

// ---------------------------------------------------------------- vocabulary + synonyms

const CONTENT_SYNONYMS: Record<string, ContentType[]> = {
  "talking head": ["talking-head"], "talking-head": ["talking-head"], talking: ["talking-head"], creator: ["talking-head"], vlogger: ["talking-head"], facecam: ["talking-head"], ugc: ["talking-head", "product-ad"],
  podcast: ["podcast-clip"], podcasts: ["podcast-clip"], interview: ["podcast-clip"],
  business: ["business-advice"], entrepreneur: ["business-advice"], startup: ["business-advice", "tech-ai"], money: ["business-advice"], finance: ["business-advice"], marketing: ["business-advice"], sales: ["business-advice"], advice: ["business-advice"], coach: ["business-advice"], coaching: ["business-advice"], wealth: ["business-advice"], hustle: ["business-advice", "motivational"],
  motivation: ["motivational"], motivational: ["motivational"], inspirational: ["motivational"], inspiration: ["motivational"], mindset: ["motivational"], discipline: ["motivational"], quotes: ["motivational"], quote: ["motivational"],
  tutorial: ["educational"], tutorials: ["educational"], education: ["educational"], educational: ["educational"], lesson: ["educational"], teach: ["educational"], teaching: ["educational"], course: ["educational"], "how-to": ["educational"], howto: ["educational"], tips: ["educational"], learn: ["educational"],
  story: ["storytime"], storytime: ["storytime"], stories: ["storytime"], narrative: ["storytime"], "true crime": ["storytime"],
  comedy: ["comedy-meme"], meme: ["comedy-meme"], memes: ["comedy-meme"], funny: ["comedy-meme"], skit: ["comedy-meme"], prank: ["comedy-meme"], reaction: ["comedy-meme"], humor: ["comedy-meme"], humour: ["comedy-meme"],
  gaming: ["gaming"], gamer: ["gaming"], game: ["gaming"], games: ["gaming"], stream: ["gaming"], streamer: ["gaming"], twitch: ["gaming"], esports: ["gaming"], montage: ["gaming"],
  fitness: ["fitness"], gym: ["fitness"], workout: ["fitness"], sport: ["fitness"], sports: ["fitness"], training: ["fitness"], athlete: ["fitness"],
  beauty: ["beauty-lifestyle"], makeup: ["beauty-lifestyle"], skincare: ["beauty-lifestyle"], lifestyle: ["beauty-lifestyle"], wellness: ["beauty-lifestyle"], grwm: ["beauty-lifestyle"], cosmetics: ["beauty-lifestyle"], aesthetic: ["beauty-lifestyle"],
  fashion: ["fashion-luxury"], luxury: ["fashion-luxury"], perfume: ["fashion-luxury", "product-ad"], jewelry: ["fashion-luxury"], jewellery: ["fashion-luxury"], couture: ["fashion-luxury"],
  product: ["product-ad"], ad: ["product-ad"], ads: ["product-ad"], advert: ["product-ad"], advertisement: ["product-ad"], brand: ["product-ad"], commercial: ["product-ad"], launch: ["product-ad"], promo: ["product-ad"], ecommerce: ["product-ad"],
  news: ["news-explainer"], explainer: ["news-explainer", "educational"], politics: ["news-explainer"], documentary: ["news-explainer", "cinematic-trailer"], commentary: ["news-explainer"], update: ["news-explainer"],
  music: ["music-lyrics"], lyrics: ["music-lyrics"], lyric: ["music-lyrics"], song: ["music-lyrics"], dance: ["music-lyrics"], rap: ["music-lyrics"],
  travel: ["travel-vlog"], vlog: ["travel-vlog"], trip: ["travel-vlog"], food: ["travel-vlog"], adventure: ["travel-vlog"],
  cinematic: ["cinematic-trailer"], trailer: ["cinematic-trailer"], film: ["cinematic-trailer"], movie: ["cinematic-trailer"], teaser: ["cinematic-trailer"],
  "real-estate": ["real-estate"], "real estate": ["real-estate"], property: ["real-estate"], realtor: ["real-estate"], "house tour": ["real-estate"], "home tour": ["real-estate"], listing: ["real-estate"],
  tech: ["tech-ai"], ai: ["tech-ai"], saas: ["tech-ai"], software: ["tech-ai"], coding: ["tech-ai"], programming: ["tech-ai"], developer: ["tech-ai"], app: ["tech-ai", "product-ad"], crypto: ["tech-ai"],
};

interface Mood {
  tones?: Tone[];
  energy?: number;
}
const MOODS: Record<string, Mood> = {
  calm: { tones: ["minimal", "elegant"], energy: 1.5 }, relaxed: { tones: ["minimal", "friendly"], energy: 1.5 }, quiet: { tones: ["minimal"], energy: 1.5 }, subtle: { tones: ["minimal", "clean"], energy: 1.5 }, soft: { tones: ["friendly", "minimal"], energy: 2 }, chill: { tones: ["minimal", "friendly"], energy: 2 },
  luxury: { tones: ["premium", "elegant"], energy: 1.5 }, luxurious: { tones: ["premium", "elegant"], energy: 1.5 }, classy: { tones: ["elegant", "premium"], energy: 2 }, sophisticated: { tones: ["elegant", "premium"], energy: 2 }, expensive: { tones: ["premium"] },
  "high-energy": { tones: ["bold"], energy: 5 }, "low-energy": { tones: ["minimal"], energy: 1.5 }, "laid-back": { tones: ["friendly", "minimal"], energy: 2 },
  hype: { tones: ["bold"], energy: 5 }, hyped: { tones: ["bold"], energy: 5 }, energetic: { tones: ["bold"], energy: 4.5 }, loud: { tones: ["bold"], energy: 5 }, punchy: { tones: ["bold"], energy: 4.5 }, intense: { tones: ["dramatic", "bold"], energy: 4.5 }, viral: { tones: ["bold"], energy: 4 },
  fun: { tones: ["playful"], energy: 4 }, cute: { tones: ["playful", "friendly"] }, silly: { tones: ["playful"], energy: 4.5 }, quirky: { tones: ["playful"] },
  simple: { tones: ["minimal", "clean"] }, professional: { tones: ["clean"], energy: 2.5 }, corporate: { tones: ["clean"], energy: 2 }, modern: { tones: ["clean"] },
  gritty: { tones: ["edgy"] }, grunge: { tones: ["edgy", "retro"] }, punk: { tones: ["edgy"] },
  epic: { tones: ["cinematic", "dramatic"] }, filmic: { tones: ["cinematic"] },
  warm: { tones: ["friendly"] }, cosy: { tones: ["friendly"] }, cozy: { tones: ["friendly"] },
  futuristic: { tones: ["techy"] }, digital: { tones: ["techy"] }, cyber: { tones: ["techy", "edgy"] }, glitch: { tones: ["techy", "edgy"] },
  vintage: { tones: ["retro"] }, y2k: { tones: ["retro"] }, nostalgic: { tones: ["retro"] },
  moody: { tones: ["dramatic", "cinematic"] }, emotional: { tones: ["dramatic"] }, dark: { tones: ["dramatic"] },
};
for (const t of TONES) MOODS[t] = { ...(MOODS[t] ?? {}), tones: [t] };

const FOOTAGE_WORDS: Record<string, FootageKind> = { busy: "busy", cluttered: "busy", "b-roll": "busy", crowded: "busy", bright: "bright", white: "bright", daylight: "bright", sunny: "bright", outdoor: "bright", outdoors: "bright", dark: "dark", night: "dark", "low-light": "dark", clean: "clean", plain: "clean", studio: "clean", simple: "clean" };
const PLATFORM_WORDS: Record<string, Platform> = { tiktok: "tiktok", reels: "reels", reel: "reels", instagram: "reels", ig: "reels", shorts: "shorts", short: "shorts", youtube: "youtube", yt: "youtube", linkedin: "linkedin" };
const PACE_WORDS: Record<string, Pace> = { slow: "slow", medium: "medium", fast: "fast", rapid: "fast", quick: "fast" };

const list = (v: string | string[] | undefined) => (v === undefined ? [] : (Array.isArray(v) ? v : String(v).split(/[,;]/)).map((x) => x.trim().toLowerCase()).filter(Boolean));
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function contentOf(word: string): ContentType[] | undefined {
  const w = word.toLowerCase().replace(/[_\s]+/g, (m) => (m.includes("_") ? "-" : " "));
  if ((CONTENT_TYPES as readonly string[]).includes(w)) return [w as ContentType];
  return CONTENT_SYNONYMS[w] ?? CONTENT_SYNONYMS[w.replace(/-/g, " ")] ?? (w.includes("/") ? w.split("/").flatMap((p) => contentOf(p) ?? []) : undefined);
}

const bad = (m: string, details?: Record<string, unknown>): never => {
  throw new CaptionsEasyError("BAD_ARGS", m, details);
};

interface Wanted {
  content: ContentType[];
  tones: Tone[];
  energy?: number;
  footage?: FootageKind;
  platform?: Platform;
  pace?: Pace;
  words: string[];
}

/** Normalise options (explicit fields win over what the free-text query implies). */
export function parseWanted(o: RecommendLooksOptions): Wanted {
  const content: ContentType[] = [];
  for (const c of list(o.content)) {
    const m = contentOf(c);
    if (!m) bad(`Unknown content "${c}". Use one of: ${CONTENT_TYPES.join(", ")}.`, { allowed: CONTENT_TYPES });
    content.push(...m!);
  }
  const tones: Tone[] = [];
  let moodEnergy: number | undefined;
  for (const t of [...list(o.tone), ...list(o.mood)]) {
    const m = MOODS[t];
    if (!m) bad(`Unknown tone "${t}". Use one of: ${TONES.join(", ")} (or a mood like calm, luxury, hype, fun).`, { allowed: TONES });
    tones.push(...(m!.tones ?? []));
    if (m!.energy !== undefined) moodEnergy = m!.energy;
  }
  if (o.energy !== undefined && !(Number.isFinite(o.energy) && o.energy >= 1 && o.energy <= 5)) bad("energy must be a number from 1 (calm) to 5 (hype).");
  if (o.footage !== undefined && !["busy", "bright", "dark", "clean"].includes(o.footage)) bad('footage must be "busy", "bright", "dark" or "clean".');
  const platform = o.platform === undefined ? undefined : PLATFORM_WORDS[String(o.platform).toLowerCase()];
  if (o.platform !== undefined && !platform) bad(`platform must be one of: ${PLATFORMS.join(", ")}.`);
  if (o.pace !== undefined && !PACES.includes(o.pace)) bad('pace must be "slow", "medium" or "fast".');
  if (o.mode !== undefined && o.mode !== "burn" && o.mode !== "overlay") bad('mode must be "burn" or "overlay".');

  // the free-text query: pull out content / tone / footage / platform / pace words, keep the rest for text matching
  const q: Wanted = { content: [], tones: [], words: [] };
  let qEnergy: number | undefined;
  const raw = (o.query ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s\-/]/gu, " ");
  let rest = ` ${raw.split(/\s+/).filter(Boolean).join(" ")} `;
  // two-word phrases first ("real estate", "clean footage", "talking head")
  for (const [phrase, c] of Object.entries(CONTENT_SYNONYMS)) {
    if (!phrase.includes(" ") || !rest.includes(` ${phrase} `)) continue;
    q.content.push(...c);
    rest = rest.replace(` ${phrase} `, " ");
  }
  const fm = / (busy|bright|dark|clean|plain|simple|cluttered|night|daylight|studio) (footage|video|background|shots?|b-roll|scenes?)/.exec(rest);
  if (fm) {
    q.footage = FOOTAGE_WORDS[fm[1]!];
    rest = rest.replace(fm[0], " ");
  }
  for (const w of rest.split(/\s+/).filter(Boolean)) {
    const c = contentOf(w);
    const m = MOODS[w];
    let used = false;
    if (c) {
      q.content.push(...c);
      used = true;
    }
    if (m) {
      q.tones.push(...(m.tones ?? []));
      if (m.energy !== undefined) qEnergy = m.energy;
      used = true;
    }
    if (!q.footage && FOOTAGE_WORDS[w] && !m && !c) {
      q.footage = FOOTAGE_WORDS[w];
      used = true;
    }
    if (PLATFORM_WORDS[w]) {
      q.platform = PLATFORM_WORDS[w];
      used = true;
    }
    if (PACE_WORDS[w] && !m) {
      q.pace = PACE_WORDS[w];
      used = true;
    }
    if (!used && w.length > 2 && !STOP.has(w)) q.words.push(w);
  }
  return {
    content: uniq(content.length ? content : q.content),
    tones: uniq(tones.length ? tones : q.tones),
    energy: o.energy ?? moodEnergy ?? qEnergy,
    footage: o.footage ?? q.footage,
    platform: platform ?? q.platform,
    pace: o.pace ?? q.pace,
    words: uniq(q.words),
  };
}
const STOP = new Set("the and for with that this video clip about some very want need make looks look style captions caption from into over talking footage background shots".split(" "));

// ---------------------------------------------------------------- scoring

/** Assumed tier score for looks newer than the tier list (the premium motion looks). */
const UNRATED_SCORE = 8.5;

function scoreLook(l: LookSummary, g: LookGuide, w: Wanted): { score: number; reasons: string[] } {
  let s = 0;
  const reasons: string[] = [];
  if (w.content.length) {
    let cs = 0;
    for (const c of w.content) {
      const i = g.bestFor.indexOf(c);
      if (i >= 0) {
        cs += 30 - 2 * i;
        reasons.push(`best for ${c}`);
      } else if (g.avoidFor.includes(c)) {
        cs -= 35;
        reasons.push(`avoid for ${c}`);
      } else cs -= 6;
    }
    s += cs / w.content.length;
  }
  if (w.tones.length) {
    const hit = w.tones.filter((t) => g.tone.includes(t));
    s += 12 * hit.length - 3 * (w.tones.length - hit.length);
    if (hit.length) reasons.push(`tone: ${hit.join(", ")}`);
  }
  if (w.energy !== undefined) {
    const d = Math.abs(g.energy - w.energy);
    s += d < 0.75 ? 6 : -7 * d;
    reasons.push(`energy ${g.energy}/5${d >= 1.5 ? ` (wanted ${w.energy})` : ""}`);
  }
  if (w.footage && w.footage !== "clean") {
    const ok = w.footage === "busy" ? g.footage.worksOnBusy : w.footage === "bright" ? g.footage.worksOnBright : g.footage.worksOnDark;
    s += ok ? (w.footage === "busy" ? 10 : w.footage === "bright" ? 8 : 4) : -18;
    reasons.push(ok ? `readable on ${w.footage} footage` : `weak on ${w.footage} footage`);
  }
  if (w.platform) {
    const ok = g.platforms.includes(w.platform);
    s += ok ? 4 : w.platform === "linkedin" ? -12 : -6;
    if (!ok) reasons.push(`not a ${w.platform} fit`);
  }
  if (w.pace) {
    const ok = g.pace.includes(w.pace);
    s += ok ? 5 : -8;
    reasons.push(ok ? `suits ${w.pace} talkers` : `not for ${w.pace} talkers`);
  }
  if (w.words.length) {
    const hay = `${l.name} ${g.summary} ${l.description} ${l.tags.join(" ")} ${l.id}`.toLowerCase();
    const hits = w.words.filter((x) => hay.includes(x));
    if (hits.length) {
      s += 6 * hits.length;
      reasons.push(`matches "${hits.join('", "')}"`);
    }
  }
  const q = g.quality?.score ?? UNRATED_SCORE;
  s += (q - 7.5) * 3;
  reasons.push(g.quality ? `quality: ${g.quality.tier} ${g.quality.score}` : "quality: premium (unrated)");
  return { score: Math.round(s * 10) / 10, reasons };
}

/** Rank the gallery looks for a described video. Deterministic; ties keep gallery order. */
export function recommendLooks(opts: RecommendLooksOptions = {}): LookRecommendation[] {
  if (V2_KEYS.some((k) => opts[k] !== undefined)) return recommendLooksV2(opts);
  const w = parseWanted(opts);
  const limit = opts.limit === undefined ? 5 : Math.max(1, Math.min(105, Math.floor(Number(opts.limit)) || 5));
  const out: LookRecommendation[] = [];
  for (const l of listLooks()) {
    const g = guideFor(l.id, l.wordsPerCard);
    if (!g) continue;
    if (opts.mode === "overlay" && g.footage.needsVideoBehind) continue;
    const { score, reasons } = scoreLook(l, g, w);
    if (opts.mode === undefined && g.footage.needsVideoBehind) reasons.push("burn-in only (made from the video)");
    out.push({ number: l.number, id: l.id, name: l.name, score, reasons, summary: g.summary, usage: g.usage });
  }
  return out.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).slice(0, limit).map((x) => x.r);
}

// ---------------------------------------------------------------- v2: transcript, brief, brand, script

const V2_KEYS = ["transcript", "brief", "brand", "script"] as const;

const MOOD_TONES: Record<LookMood, Tone[]> = {
  calm: ["minimal", "elegant"], warm: ["friendly"], playful: ["playful"], hype: ["bold"], dramatic: ["dramatic"], luxe: ["premium", "elegant"],
  edgy: ["edgy"], techy: ["techy"], cinematic: ["cinematic"], clean: ["clean", "minimal"], retro: ["retro"], dreamy: ["elegant", "minimal"],
};
const HYPE = new Set("insane crazy amazing huge massive secret best worst wow omg literally unbelievable incredible never always biggest".split(" "));


const toWords = (t: RecommendLooksOptions["transcript"]): { text: string; startMs?: number; endMs?: number }[] => {
  if (t === undefined) return [];
  if (typeof t === "string") return t.split(/\s+/).filter(Boolean).map((text) => ({ text }));
  const list = Array.isArray(t) ? t : (t as { words?: TranscriptWord[] }).words;
  if (!Array.isArray(list)) return bad("transcript must be words [{ text, startMs, endMs }], a Transcript { words } or plain text.");
  return list.map((w, i) => (w && typeof w.text === "string" ? w : bad(`transcript word ${i} needs a text.`)));
};

/** Read what a transcript says about the video: pace, topic, energy cues, script, length. Deterministic. */
export function analyzeTranscript(t: RecommendLooksOptions["transcript"]): TranscriptAnalysis {
  const ws = toWords(t);
  const n = ws.length;
  const notes: string[] = [];
  const text = ws.map((w) => w.text).join(" ");
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const script: Script = deva > latin ? "devanagari" : "latin";
  const clean = ws.map((w) => w.text.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
  // romanized Hindi: count only function words that are not also English ("to", "the", "me", "is", "main" ... are both)
  const ev = hinglishEvidence(clean);
  const hinglish = script === "latin" && n >= 4 && ev.distinctHindi >= 2 && ev.hindi / Math.max(1, ev.total) >= 0.15 && ev.hindi >= ev.english * 0.5;
  // topic: content synonyms that show up in what is said (two-word phrases first)
  const counts = new Map<ContentType, number>();
  const bump = (cs: ContentType[] | undefined) => cs?.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  for (let i = 0; i < clean.length; i++) {
    const two = CONTENT_SYNONYMS[`${clean[i]} ${clean[i + 1] ?? ""}`];
    if (two) {
      bump(two);
      i++;
      continue;
    }
    if (clean[i]!.length > 2) bump(contentOf(clean[i]!));
  }
  const need = n < 40 ? 1 : 2;
  const content = [...counts.entries()].filter(([, c]) => c >= need).sort((a, b) => b[1] - a[1] || CONTENT_TYPES.indexOf(a[0]) - CONTENT_TYPES.indexOf(b[0])).slice(0, 2).map(([c]) => c);
  const timed = ws.filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs));
  let durationMs: number | undefined;
  let wps: number | undefined;
  let pace: Pace | undefined;
  if (timed.length >= 4) {
    durationMs = Math.max(1, timed[timed.length - 1]!.endMs! - timed[0]!.startMs!);
    wps = Math.round((timed.length / (durationMs / 1000)) * 10) / 10;
    pace = wps < 2.2 ? "slow" : wps > 3.2 ? "fast" : "medium";
    notes.push(`${wps} words/s (${pace})`);
  }
  const cues = ws.filter((w) => /!["')\]]*$/.test(w.text) || (w.text.replace(/[^A-Za-z]/g, "").length >= 3 && w.text === w.text.toUpperCase() && /[A-Z]/.test(w.text)) || HYPE.has(w.text.toLowerCase().replace(/[^a-z]/g, ""))).length;
  const cueRate = n ? (cues / n) * 100 : 0;
  const energy = n < 6 ? undefined : cueRate >= 6 ? 4.5 : cueRate >= 3 ? 3.5 : cueRate <= 0.5 && (wps ?? 2.5) < 2.3 ? 2 : undefined;
  if (energy !== undefined) notes.push(`energy cues ${energy >= 3.5 ? "high" : "low"}`);
  const numberShare = n ? ws.filter((w) => /\p{Nd}/u.test(w.text)).length / n : 0;
  if (content.length) notes.push(`topic: ${content.join(", ")}`);
  if (script === "devanagari") notes.push("written in Devanagari");
  else if (hinglish) notes.push("Hinglish (romanized)");
  return { words: n, ...(durationMs !== undefined ? { durationMs, wordsPerSecond: wps, pace } : {}), script, hinglish, content, ...(energy !== undefined ? { energy } : {}), numberShare, notes };
}

function brandOf(b: RecommendLooksOptions["brand"]): { tones: Tone[]; colors: string[]; theme?: string } {
  if (b === undefined) return { tones: [], colors: [] };
  const isThemeRef = typeof b === "string" || (typeof b === "object" && b !== null && "id" in b);
  const themeRef: ThemeRef | undefined = isThemeRef ? (b as ThemeRef) : (b as { theme?: ThemeRef }).theme;
  const theme = themeRef === undefined ? undefined : resolveTheme(themeRef);
  const tones: Tone[] = theme ? [...MOOD_TONES[theme.mood]] : [];
  const extra = isThemeRef ? undefined : (b as { tone?: string | string[] }).tone;
  for (const t of list(extra)) {
    const m = MOODS[t];
    if (!m) bad(`brand.tone: unknown tone "${t}". Use one of: ${TONES.join(", ")} (or a mood like calm, luxury, hype, fun).`);
    tones.push(...(m!.tones ?? []));
  }
  const colors = isThemeRef ? [] : ((b as { colors?: unknown }).colors ?? []);
  if (!Array.isArray(colors) || !colors.every((c) => typeof c === "string" && isColor(c))) bad('brand.colors must be colours like ["#FF3366", "#111111"].');
  return { tones: uniq(tones), colors: colors as string[], ...(theme ? { theme: theme.id } : {}) };
}

const takesColour = new Map<string, boolean>();
const colourControls = (id: string) => {
  if (!takesColour.has(id)) takesColour.set(id, describeLook(id).controls.some((c) => c.key === "fill.color" || c.key === "active.color" || c.key === "active.boxColor"));
  return takesColour.get(id)!;
};

function recommendLooksV2(opts: RecommendLooksOptions): LookRecommendation[] {
  const a = analyzeTranscript(opts.transcript);
  const brand = brandOf(opts.brand);
  if (opts.script !== undefined && !["latin", "devanagari", "auto"].includes(opts.script)) bad('script must be "latin", "devanagari" or "auto".');
  const script: Script = opts.script === undefined || opts.script === "auto" ? a.script : opts.script;
  const query = [opts.query, opts.brief].filter((x): x is string => typeof x === "string" && !!x.trim()).join(" ");
  const w = parseWanted({ ...opts, query: query || undefined });
  // what the caller states wins; the transcript and brand fill the gaps
  if (!w.content.length) w.content = a.content;
  if (!w.pace && a.pace) w.pace = a.pace;
  if (w.energy === undefined && a.energy !== undefined) w.energy = a.energy;
  w.tones = uniq([...w.tones, ...brand.tones]);
  const limit = opts.limit === undefined ? 5 : Math.max(1, Math.min(105, Math.floor(Number(opts.limit)) || 5));
  const lead = [...a.notes.map((x) => `transcript: ${x}`), ...(brand.theme ? [`brand theme: ${brand.theme}`] : [])];
  const long = (a.durationMs ?? 0) > 60_000 || a.words > 150;
  const short = a.durationMs !== undefined && a.durationMs < 15_000;

  const out: (LookRecommendation & { i: number })[] = [];
  listLooks().forEach((l, i) => {
    const g = guideFor(l.id, l.wordsPerCard);
    if (!g) return;
    if (opts.mode === "overlay" && g.footage.needsVideoBehind) return;
    const scored = scoreLook(l, g, w);
    let score = scored.score;
    const reasons = scored.reasons;
    const add = (n: number, why: string) => {
      score += n;
      reasons.push(why);
    };
    if (script === "devanagari") {
      if (g.scripts.includes("devanagari")) add(8, "draws Devanagari natively");
      else if (g.complexScriptSafe) add(-2, `Devanagari through the bundled fallback font ${lookScriptSupport(l.id).fallback.devanagari ?? ""}`.trim());
      else add(-40, "splits letters, which breaks Devanagari: romanize the words (settings.romanize) or pick another look");
    }
    if (long) {
      if (g.energy >= 5 && l.wordsPerCard <= 1) add(-8, "tiring over a long talk");
      else if (l.wordsPerCard >= 3 && g.pace.includes("medium")) add(4, "comfortable over a long talk");
    } else if (short && g.energy >= 4) add(3, "short clip: punchy works");
    if (a.numberShare >= 0.08) {
      const lv = roleSupport(l.id).levers;
      if (lv.emphasis || lv.color) add(3, "can make figures stand out (roles)");
    }
    if (brand.colors.length) {
      if (colourControls(l.id)) add(4, "takes your brand colours");
      else add(-4, "fixed colours: brand colours cannot apply");
    }
    if (opts.mode === undefined && g.footage.needsVideoBehind) reasons.push("burn-in only (made from the video)");
    out.push({ number: l.number, id: l.id, name: l.name, score: Math.round(score * 10) / 10, reasons: [...lead, ...reasons], summary: g.summary, usage: g.usage, mood: g.mood, pairsWith: g.pairsWith, i });
  });
  const ranked = out.sort((x, y) => y.score - x.score || x.i - y.i).slice(0, limit);
  // never a silent default: when nothing fits well, say so on every result
  const best = ranked[0]?.score ?? 0;
  const weak = best < 15 ? `weak fit overall (best score ${best}): nothing matches the brief strongly, so treat these as starting points` : undefined;
  return ranked.map(({ i: _i, ...r }) => (weak ? { ...r, reasons: [...r.reasons, weak] } : r));
}
