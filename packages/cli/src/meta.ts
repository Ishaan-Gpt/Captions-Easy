/**
 * Look metadata added in 0.2.0: mood, formality, suits, scripts, pairsWith / avoidWith.
 *
 * Derived by FIXED RULES from evidence that already exists, so it cannot drift or flatter a look:
 *   mood / formality / suits  from the hand-written guide card (tone, energy, bestFor/avoidFor, summary)
 *   scripts                   from the fonts the look draws with + whether its layout keeps words whole (measured by
 *                             templates/src/capabilities.test.tsx: letter-splitting layouts break Devanagari shaping)
 *   pairsWith / avoidWith     from each look's slot in a multi-look video (hook, body, stamp), tone, mood, formality
 *                             and footage, never two looks of the same template
 */
import { LOOKS, NATIVE_DEVANAGARI, applyLook, lookNumber, lookScriptSupport, type LookDefinition } from "@capseasy/templates";
import { GUIDE, QUALITY, type GuideEntry } from "./guide";
import type { ContentType, Formality, LookMood, Script, Suit } from "./types";

export const MOODS: readonly LookMood[] = ["calm", "warm", "playful", "hype", "dramatic", "luxe", "edgy", "techy", "cinematic", "clean", "retro", "dreamy"];
export const FORMALITIES: readonly Formality[] = ["casual", "neutral", "formal"];
export const SUITS: readonly Suit[] = ["talking-head", "explainer", "podcast", "product-ad", "story"];
export const SCRIPTS: readonly Script[] = ["latin", "devanagari"];

/** Bundled look fonts that carry Devanagari themselves (templates scriptFonts, checked against the font files). */
export const DEVANAGARI_FONTS: ReadonlySet<string> = NATIVE_DEVANAGARI;

const SUIT_CONTENT: Record<Suit, ContentType[]> = {
  "talking-head": ["talking-head", "business-advice", "motivational", "comedy-meme", "fitness", "gaming"],
  explainer: ["educational", "news-explainer", "tech-ai"],
  podcast: ["podcast-clip"],
  "product-ad": ["product-ad", "fashion-luxury", "real-estate", "beauty-lifestyle"],
  story: ["storytime", "travel-vlog", "cinematic-trailer", "music-lyrics"],
};

export function moodOf(g: GuideEntry): LookMood {
  const has = (t: string) => g.tone.includes(t as never);
  // a glowing, blooming low-energy look reads as dreamy (a "soft shadow" or a "soft box" does not)
  const soft = /\b(dream|bloom|halo|glow)/i.test(g.summary) && g.energy <= 2 && !has("clean");
  switch (g.tone[0]) {
    case "bold": return g.energy >= 4 || !has("clean") ? "hype" : "clean";
    case "playful": return "playful";
    case "elegant": return soft ? "dreamy" : g.energy <= 2 && has("minimal") ? "calm" : "luxe";
    case "premium": return g.energy >= 4 || has("edgy") || has("dramatic") ? "dramatic" : "luxe";
    case "minimal": return soft ? "dreamy" : g.energy <= 2 ? "calm" : "clean";
    case "edgy": return "edgy";
    case "cinematic": return "cinematic";
    case "friendly": return soft ? "dreamy" : "warm";
    case "techy": return "techy";
    case "retro": return "retro";
    case "dramatic": return "dramatic";
    default: return "clean";
  }
}

export function formalityOf(g: GuideEntry): Formality {
  const casual = g.tone.some((t) => t === "playful" || t === "edgy" || t === "retro") || g.bestFor.some((c) => c === "comedy-meme" || c === "gaming") || g.energy === 5;
  if (casual) return "casual";
  const formalTone = g.tone.some((t) => t === "elegant" || t === "premium" || t === "clean" || t === "minimal");
  return formalTone && g.energy <= 3 && g.tone.every((t) => ["elegant", "premium", "clean", "minimal", "cinematic", "dramatic"].includes(t)) ? "formal" : "neutral";
}

export function suitsOf(g: GuideEntry): Suit[] {
  const rank = (s: Suit) => Math.min(...SUIT_CONTENT[s].map((c) => (g.bestFor.includes(c) ? g.bestFor.indexOf(c) : 99)));
  const out = SUITS.filter((s) => rank(s) < 99 && !g.avoidFor.includes(SUIT_CONTENT[s][0]!));
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * Scripts a look draws natively (templates lookScriptSupport: its fonts have the glyphs and its template does not split
 * words), and whether it keeps every word whole: then a complex script renders through the bundled fallback font.
 * Both checks must hold: the template list (code-point splitting) and the measured whole-word renders.
 */
export function scriptsFor(look: LookDefinition): { scripts: Script[]; complexScriptSafe: boolean } {
  const sup = lookScriptSupport(look);
  // one source of truth: LATIN_ONLY_TEMPLATES (templates/scriptSupport.ts, = both render checks)
  const safe = !sup.unsupported.includes("devanagari");
  return { scripts: safe ? (sup.native as Script[]) : ["latin"], complexScriptSafe: safe };
}

// ---------------------------------------------------------------- pairs for multi-look videos

type Slot = "hook" | "body" | "stamp";
interface Info {
  id: string;
  number: number;
  templateId: string;
  wpc: number;
  g: GuideEntry;
  mood: LookMood;
  formality: Formality;
  slots: Set<Slot>;
  quality: number;
}

function slotsOf(g: GuideEntry, wpc: number, tier: string | undefined): Set<Slot> {
  const s = new Set<Slot>();
  if (wpc === 1 || (g.energy >= 4 && wpc <= 2)) s.add("stamp");
  if ((g.energy >= 4 || g.tone.includes("dramatic") || g.tone.includes("cinematic")) && tier !== "low") s.add("hook");
  if (wpc >= 3 && g.pace.includes("medium") && (g.footage.worksOnBusy || g.footage.worksOnDark) && g.energy <= 4) s.add("body");
  if (!s.size) s.add(wpc >= 2 ? "body" : "stamp");
  return s;
}

let infos: Info[] | undefined;
function allInfo(): Info[] {
  if (infos) return infos;
  infos = LOOKS.filter((l) => GUIDE[l.id]).map((l) => {
    const g = GUIDE[l.id]!;
    const wpc = applyLook(l).settings.maxWordsPerCard ?? 3;
    return { id: l.id, number: l.number ?? lookNumber(l.id) ?? 0, templateId: l.templateId, wpc, g, mood: moodOf(g), formality: formalityOf(g), slots: slotsOf(g, wpc, QUALITY[l.id]?.tier), quality: QUALITY[l.id]?.score ?? 8.5 };
  });
  return infos;
}

const toneOverlap = (a: Info, b: Info) => a.g.tone.filter((t) => b.g.tone.includes(t)).length;
const sharesFootage = (a: Info, b: Info) =>
  (a.g.footage.worksOnBusy && b.g.footage.worksOnBusy) || (a.g.footage.worksOnBright && b.g.footage.worksOnBright) || (a.g.footage.worksOnDark && b.g.footage.worksOnDark);
const formalClash = (a: Info, b: Info) => (a.formality === "casual" && b.formality === "formal") || (a.formality === "formal" && b.formality === "casual");

function pairScore(a: Info, b: Info): number | null {
  if (a.id === b.id || a.templateId === b.templateId) return null;
  if (![...b.slots].some((s) => !a.slots.has(s))) return null; // must bring a slot the first lacks
  if (formalClash(a, b) || !sharesFootage(a, b)) return null;
  if (b.g.footage.needsVideoBehind !== a.g.footage.needsVideoBehind && (b.g.footage.needsVideoBehind || a.g.footage.needsVideoBehind)) return null;
  const overlap = toneOverlap(a, b);
  if (!overlap && a.mood !== b.mood) return null;
  const de = Math.abs(a.g.energy - b.g.energy);
  return 4 * overlap + (a.mood === b.mood ? 3 : 0) + (de <= 1 ? 2 : -de) + b.quality / 2;
}

function avoidScore(a: Info, b: Info): number | null {
  if (a.id === b.id) return null;
  const clash = formalClash(a, b) || (toneOverlap(a, b) === 0 && Math.abs(a.g.energy - b.g.energy) >= 2);
  if (!clash) return null;
  const sharedSlot = [...a.slots].some((s) => b.slots.has(s));
  return (formalClash(a, b) ? 4 : 0) + (toneOverlap(a, b) === 0 ? 3 : 0) + Math.abs(a.g.energy - b.g.energy) + (sharedSlot ? 2 : 0) + b.quality / 4;
}

const ranked = (a: Info, score: (a: Info, b: Info) => number | null) =>
  allInfo()
    .map((b) => ({ b, s: score(a, b) }))
    .filter((x): x is { b: Info; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s || x.b.number - y.b.number);

/** Looser partner score when the strict rules find too few: same formality band and close energy, any tone. */
function loosePairScore(a: Info, b: Info): number | null {
  if (a.id === b.id || a.templateId === b.templateId || formalClash(a, b) || !sharesFootage(a, b)) return null;
  if (![...b.slots].some((s) => !a.slots.has(s)) || Math.abs(a.g.energy - b.g.energy) > 1) return null;
  return b.quality / 2 - Math.abs(a.g.energy - b.g.energy);
}

/**
 * Partners that complete a multi-look video: for every slot (hook / body / stamp) the look cannot fill itself, the
 * two best looks that fill it; best first, at most 4. Falls back to a looser match when the strict rules find < 2.
 */
function partners(a: Info): number[] {
  const pick = (score: (a: Info, b: Info) => number | null) => {
    const all = ranked(a, score);
    const out: { n: number; s: number }[] = [];
    for (const slot of ["body", "hook", "stamp"] as Slot[]) {
      if (a.slots.has(slot)) continue;
      for (const x of all.filter((x) => x.b.slots.has(slot)).slice(0, 2)) if (!out.some((o) => o.n === x.b.number)) out.push({ n: x.b.number, s: x.s });
    }
    return out.sort((x, y) => y.s - x.s || x.n - y.n).map((x) => x.n);
  };
  const strict = pick(pairScore);
  if (strict.length >= 2) return strict.slice(0, 4);
  return [...strict, ...pick(loosePairScore).filter((n) => !strict.includes(n))].slice(0, 4);
}

const pairCache = new Map<string, { pairsWith: number[]; avoidWith: number[] }>();
export function pairsFor(id: string): { pairsWith: number[]; avoidWith: number[] } {
  const hit = pairCache.get(id);
  if (hit) return hit;
  const a = allInfo().find((x) => x.id === id);
  const r = a ? { pairsWith: partners(a), avoidWith: ranked(a, avoidScore).slice(0, 3).map((x) => x.b.number) } : { pairsWith: [], avoidWith: [] };
  pairCache.set(id, r);
  return r;
}

/** The slots a look can fill in a multi-look video (for tracks). */
export const slotsFor = (id: string): Slot[] => [...(allInfo().find((x) => x.id === id)?.slots ?? [])];
