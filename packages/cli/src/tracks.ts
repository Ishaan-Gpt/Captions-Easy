/**
 * Multi-look caption tracks (0.2.0): one props object holding several looks, each on its own words (hook, body,
 * key-word stamps, numbers, list items, CTA), all under one theme, with transitions where one look hands over to the
 * next. Opt-in through buildCaptions({ tracks }); without `tracks` nothing here runs.
 *
 * A track selects words by caller word index range, time span, role, or "the rest" (filters combine as AND), and
 * names its look (number / id / custom). Tracks on the same layer may not share a word (clear BAD_TRACKS error);
 * higher layers draw above lower ones (stamps over the body). See docs/composition.md section 5.
 */
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { assignRoles } from "@motion-ai/caption-engine/core";
import { lookCapabilities } from "@capseasy/templates";
import { applySettingsOverrides, applyStyleOverrides, toDocWords } from "./captions";
import { resolveLookRef, styleFor } from "./custom";
import { CaptionsEasyError } from "./errors";
import { describeLook, lookBase, settingControls } from "./looks";
import { alignToDoc, compileRoles, lookPalette, normalizeRoles, validateRoleMap, WORD_ROLES } from "./roles";
import { validateLayout } from "./safety";
import { resolveTheme } from "./themes";
import type { BuildCaptionsInput, CaptionsProps, CaptionsTrack, LookRef, TrackPlan, TrackPosition, TrackSlot, TrackTransitionInput, TranscriptWord, WordRole } from "./types";

export const TRACK_SLOTS: readonly TrackSlot[] = ["hook", "body", "stamp", "number", "list", "cta"];
export const TRACK_TRANSITIONS = ["cut", "exit-entry", "morph"] as const;
/** whole-card exits for looks that have no exit of their own */
export const TRACK_EXITS = ["fade", "fall", "zoom-out", "blur-out", "slide-up"] as const;
export const TRACK_POSITIONS: Record<Exclude<TrackPosition, object>, number> = { top: 0.2, upper: 0.32, middle: 0.5, lower: 0.68, bottom: 0.8 };
const DEFAULT_DURATION = { cut: 0, "exit-entry": 260, morph: 420 } as const;

const bad = (m: string, details?: unknown): never => {
  throw new CaptionsEasyError("BAD_TRACKS", m, details);
};
const isRole = (r: unknown): r is WordRole => typeof r === "string" && (WORD_ROLES as readonly string[]).includes(r);
const stampSlot = (s?: TrackSlot) => s === "stamp" || s === "number";

/**
 * Morph-compatible looks: layouts that draw each word as its own run of text and honour per-word size and colour
 * (measured: templates lookCapabilities), so a card can travel, rescale and recolour into the next one honestly.
 * Two looks morph only when both are in this family and use the same letter casing.
 */
export function morphCompatible(a: { id: string; casing: string }, b: { id: string; casing: string }): { ok: true } | { ok: false; reason: string } {
  for (const x of [a, b]) {
    const lv = lookCapabilities(x.id).levers;
    if (!(lv.size && lv.color)) return { ok: false, reason: `${x.id} is a composed layout (it does not draw words as plain resizable text)` };
  }
  if (a.casing !== b.casing) return { ok: false, reason: `the casing differs (${a.casing} vs ${b.casing})` };
  return { ok: true };
}

export function normalizeTransition(t: TrackTransitionInput | undefined, where: string): CaptionsTrack["transition"] {
  if (t === undefined) return { type: "cut", durationMs: 0, overlapMs: 0 };
  const o = typeof t === "string" ? { type: t } : t;
  if (!o || typeof o !== "object") bad(`${where}.transition must be "cut", "exit-entry", "morph" or { type, durationMs?, overlapMs? }.`);
  if (!(TRACK_TRANSITIONS as readonly string[]).includes(o.type as string)) bad(`${where}.transition.type must be one of: ${TRACK_TRANSITIONS.join(", ")} (got ${JSON.stringify(o.type)}).`);
  const type = o.type as CaptionsTrack["transition"]["type"];
  const num = (k: "durationMs" | "overlapMs", def: number, max: number) => {
    const v = o[k];
    if (v === undefined) return def;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) bad(`${where}.transition.${k} must be a number from 0 to ${max} (got ${JSON.stringify(v)}).`);
    return v as number;
  };
  const durationMs = num("durationMs", DEFAULT_DURATION[type], 1500);
  const overlapMs = num("overlapMs", 0, 1000);
  if (overlapMs > durationMs && type === "exit-entry") bad(`${where}.transition.overlapMs (${overlapMs}) cannot exceed durationMs (${durationMs}).`);
  return { type, durationMs: type === "cut" ? 0 : durationMs, overlapMs: type === "exit-entry" ? overlapMs : 0 };
}

/** caller word index for every doc word (normalisation sorts by time and drops noise; matched by start time). */
function callerIndexOf(callerWords: TranscriptWord[], doc: Word[]): (number | undefined)[] {
  return alignToDoc(callerWords, callerWords.map((_, i) => i as unknown as WordRole), doc) as unknown as (number | undefined)[];
}

interface Selection {
  name: string;
  layer: number;
  plan: TrackPlan;
  owned: number[];
}

function selectWords(plan: TrackPlan, where: string, doc: Word[], caller: (number | undefined)[], nCaller: number, roles: (WordRole | undefined)[] | null): { sel: number[] | null; rest: boolean } {
  let sel: number[] | null = null;
  const and = (keep: (i: number) => boolean) => {
    sel = (sel ?? doc.map((_, i) => i)).filter(keep);
  };
  if (plan.words !== undefined) {
    const r = Array.isArray(plan.words) ? { from: plan.words[0], to: plan.words[1] } : plan.words;
    if (!r || typeof r !== "object" || !Number.isInteger(r.from) || (r.to !== undefined && !Number.isInteger(r.to))) bad(`${where}.words must be [from, to] or { from, to? }: caller word indices, to exclusive.`);
    const from = r.from as number;
    const to = (r.to ?? nCaller) as number;
    if (from < 0 || to > nCaller || from >= to) bad(`${where}.words [${from}, ${to}) must satisfy 0 <= from < to <= ${nCaller} (the number of words).`, { from, to, words: nCaller });
    and((i) => caller[i] !== undefined && caller[i]! >= from && caller[i]! < to);
  }
  if (plan.time !== undefined) {
    const t = Array.isArray(plan.time) ? { fromMs: plan.time[0], toMs: plan.time[1] } : plan.time;
    if (!t || typeof t !== "object") bad(`${where}.time must be [fromMs, toMs] or { fromMs?, toMs? }.`);
    const from = t.fromMs ?? 0;
    const to = t.toMs ?? Infinity;
    if (typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || Number.isNaN(to) || from >= to) bad(`${where}.time must have fromMs < toMs (got ${JSON.stringify(plan.time)}).`);
    // a word belongs to the span its middle falls in, so two adjacent spans never share one
    and((i) => {
      const mid = (doc[i]!.startMs + doc[i]!.endMs) / 2;
      return mid >= from && mid < to;
    });
  }
  if (plan.role !== undefined) {
    const list = Array.isArray(plan.role) ? plan.role : [plan.role];
    if (!list.length) bad(`${where}.role must name at least one role.`);
    for (const r of list) if (!isRole(r)) bad(`${where}.role "${String(r)}" is not a role. Roles: ${WORD_ROLES.join(", ")}.`);
    and((i) => !!roles?.[i] && list.includes(roles[i]!));
  }
  if (plan.rest !== undefined && plan.rest !== true && plan.rest !== false) bad(`${where}.rest must be true or false.`);
  if (sel === null && plan.rest !== true) bad(`${where} selects no words: give words: [from, to], time: { fromMs, toMs }, role: [...] and/or rest: true.`);
  return { sel, rest: plan.rest === true };
}

/** Validate a plan (also used by plan_tracks) and resolve which doc words each track owns. */
function resolveOwnership(plans: TrackPlan[], doc: Word[], callerWords: TranscriptWord[], roles: (WordRole | undefined)[] | null, warnings: string[]): Selection[] {
  const caller = callerIndexOf(callerWords, doc);
  const sels: (Selection & { rest: number[] | null })[] = plans.map((plan, i) => {
    const where = `tracks[${i}]`;
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) bad(`${where} must be an object { look, words | time | role | rest, ... }.`);
    if (plan.look === undefined || plan.look === null || plan.look === "") bad(`${where} needs a look (number, id or custom look).`);
    if (plan.slot !== undefined && !TRACK_SLOTS.includes(plan.slot)) bad(`${where}.slot must be one of: ${TRACK_SLOTS.join(", ")} (got ${JSON.stringify(plan.slot)}).`);
    if (plan.layer !== undefined && !(Number.isInteger(plan.layer) && plan.layer >= 0 && plan.layer <= 9)) bad(`${where}.layer must be a whole number from 0 to 9.`);
    const layer = plan.layer ?? (stampSlot(plan.slot) ? 1 : 0);
    const name = typeof plan.name === "string" && plan.name.trim() ? plan.name.trim() : plan.slot ? `${plan.slot}${plans.filter((p, j) => j < i && p.slot === plan.slot).length || ""}` : `track${i}`;
    const s = selectWords(plan, where, doc, caller, callerWords.length, roles);
    const owned = s.sel ?? doc.map((_, k) => k);
    return { name, layer, plan, owned, rest: s.rest ? owned : null };
  });
  const names = new Set<string>();
  for (const s of sels) {
    if (names.has(s.name)) bad(`Two tracks are named "${s.name}". Give each track a unique name.`);
    names.add(s.name);
  }
  for (const layer of [...new Set(sels.map((s) => s.layer))]) {
    const inLayer = sels.filter((s) => s.layer === layer);
    const rests = inLayer.filter((s) => s.rest);
    if (rests.length > 1) bad(`Layer ${layer} has more than one rest track (${rests.map((s) => s.name).join(", ")}); only one track per layer can take the rest.`);
    const owner = new Map<number, string>();
    const clashes: { word: number; text: string; tracks: [string, string] }[] = [];
    for (const s of inLayer.filter((x) => !x.rest)) {
      for (const w of s.owned) {
        const prev = owner.get(w);
        if (prev !== undefined) clashes.push({ word: caller[w] ?? w, text: doc[w]!.text, tracks: [prev, s.name] });
        else owner.set(w, s.name);
      }
    }
    if (clashes.length) {
      const first = clashes.slice(0, 5).map((c) => `word ${c.word} "${c.text}" (${c.tracks[0]} and ${c.tracks[1]})`).join(", ");
      bad(`Tracks on layer ${layer} overlap: ${first}${clashes.length > 5 ? ` and ${clashes.length - 5} more` : ""}. A word can belong to one track per layer; to draw one look over another (stamps over the body), put it on a higher layer.`, { layer, clashes });
    }
    for (const r of rests) {
      r.owned = r.rest!.filter((i) => !owner.has(i)).sort((a, b) => a - b);
    }
    if (layer === 0) {
      const covered = new Set(inLayer.flatMap((s) => s.owned));
      const missing = doc.map((_, i) => i).filter((i) => !covered.has(i));
      if (missing.length) warnings.push(`${missing.length} word(s) are in no base-layer track and are not captioned (e.g. "${missing.slice(0, 4).map((i) => doc[i]!.text).join(" ")}"); add a track with rest: true to cover them`);
    }
  }
  return sels;
}

function positionOverride(p: TrackPosition | undefined, where: string): Record<string, unknown> {
  if (p === undefined) return {};
  if (typeof p === "string") {
    if (!(p in TRACK_POSITIONS)) bad(`${where}.position must be one of: ${Object.keys(TRACK_POSITIONS).join(", ")} or { x?, y } (got ${JSON.stringify(p)}).`);
    return { "position.y": TRACK_POSITIONS[p as keyof typeof TRACK_POSITIONS] };
  }
  if (!p || typeof p !== "object" || typeof p.y !== "number") bad(`${where}.position must be a band name or { x?, y } (frame fractions).`);
  return { "position.y": p.y, ...(typeof p.x === "number" ? { "position.x": p.x } : {}) };
}

/** buildCaptions({ tracks }) */
export function buildTrackCaptions(input: BuildCaptionsInput & { durationMs?: number }): CaptionsProps {
  const plans = input.tracks as TrackPlan[];
  if (!Array.isArray(plans) || plans.length === 0) bad("tracks must be a non-empty array of { look, words | time | role | rest, slot?, ... }.");
  if (input.look !== undefined) bad("Pass either look (one look for every word) or tracks (a look per track), not both.");
  if (input.overrides !== undefined && Object.keys(input.overrides).length) bad("With tracks, style overrides go on each track (tracks[i].overrides), since every look has its own controls.");
  if (input.stamps !== undefined && input.stamps !== false) bad('With tracks, make a stamp track instead of stamps: { slot: "stamp", role: ["key", "number"], look: ... }.');
  const warnings: string[] = [];
  const theme = input.theme === undefined ? undefined : resolveTheme(input.theme);
  const global = (input.settings ?? {}) as Record<string, unknown>;
  const truthy = (v: unknown) => v === true || v === "true";
  const spelling = global.hinglishSpelling === "creator" ? "creator" : undefined;
  const docWords = toDocWords(input.words, input.durationMs, truthy(global.romanize), spelling);
  if (!docWords.length) warnings.push("no words to caption: the output will have no captions");
  const layout = input.layout === undefined ? undefined : validateLayout(input.layout);

  // roles: needed to route words by role, and (opt-in) to style them
  const needRoles = input.roles !== undefined || plans.some((p) => p && p.role !== undefined);
  let roles: (WordRole | undefined)[] | null = null;
  if (needRoles) {
    const { explicit, auto } = normalizeRoles(input.roles ?? "auto", input.words);
    roles = assignRoles(docWords, { explicit: alignToDoc(input.words, explicit, docWords), auto, settings: ProjectSettingsSchema.parse({ maxWordsPerCard: 3 }) });
  }
  const sels = resolveOwnership(plans, docWords, input.words, roles, warnings);
  const globalRoleMap = validateRoleMap(input.roleMap);

  const tracks: CaptionsTrack[] = [];
  const baseIds = new Map<string, string>();
  sels.forEach((sel, i) => {
    const where = `tracks[${i}] (${sel.name})`;
    const plan = sel.plan;
    const { look, custom } = resolveLookRef(plan.look as LookRef);
    const label = custom ? `${custom.name} (custom on #${look.number})` : `${look.name} (#${look.number})`;
    const tw: string[] = [];
    const t = theme ?? (custom?.theme !== undefined ? resolveTheme(custom.theme) : undefined);
    let { style, themed } = styleFor(look, t, custom?.overrides ?? {}, tw);
    const over = { ...positionOverride(plan.position, `tracks[${i}]`), ...(plan.overrides ?? {}) };
    if (Object.keys(over).length) style = applyStyleOverrides(look.number!, style, over, tw);
    const base = lookBase(look);
    const controls = settingControls(look, base.settings);
    const slotDefaults: Record<string, unknown> = stampSlot(plan.slot) ? Object.fromEntries(Object.entries({ maxWordsPerCard: 1, gapBehavior: "clear" }).filter(([k]) => controls.some((c) => c.key === k))) : {};
    const settings = applySettingsOverrides(controls, base.settings, { ...(custom?.settings ?? {}), ...slotDefaults, ...global, ...(plan.settings ?? {}) }, label, tw);
    let words: Word[] = sel.owned.map((k) => ({ ...docWords[k]!, ...(roles?.[k] ? { role: roles[k] } : {}) }));
    let roleInfo: CaptionsTrack["roles"];
    if (input.roles !== undefined || plan.roleMap !== undefined) {
      const roleMap = { ...globalRoleMap, ...validateRoleMap(plan.roleMap) };
      const compiled = compileRoles(words, { lookId: look.id, lookName: label, explicit: words.map((w) => w.role), auto: false, settings, palette: t?.palette ?? lookPalette(style), roleMap });
      words = compiled.words;
      tw.push(...compiled.warnings);
      roleInfo = { counts: compiled.counts, levers: describeLook(look.number!).roles.levers };
    }
    if (!words.length) {
      warnings.push(`${where}: selects no words, so it is left out`);
      return;
    }
    const exitControl = describeLook(look.number!).controls.some((c) => c.key === "exit.type");
    if (plan.exit !== undefined && !(TRACK_EXITS as readonly string[]).includes(plan.exit)) bad(`tracks[${i}].exit must be one of: ${TRACK_EXITS.join(", ")} (got ${JSON.stringify(plan.exit)}).`);
    const exit = exitControl && style.exit.type !== "none" && plan.exit === undefined ? { type: style.exit.type, native: true } : { type: plan.exit ?? "blur-out", native: false };
    warnings.push(...tw.map((w) => `${sel.name}: ${w}`));
    const doc = CaptionDocSchema.parse({ version: 2, language: input.language ?? "en", words });
    baseIds.set(sel.name, look.id);
    tracks.push({
      id: sel.name,
      name: sel.name,
      ...(plan.slot ? { slot: plan.slot } : {}),
      layer: sel.layer,
      look: custom ? { number: look.number ?? 0, id: custom.id, name: custom.name, custom: true, baseNumber: look.number ?? 0 } : { number: look.number ?? 0, id: look.id, name: look.name },
      startMs: words[0]!.startMs,
      endMs: words[words.length - 1]!.endMs,
      doc: doc as CaptionsTrack["doc"],
      style: style as CaptionsTrack["style"],
      settings: settings as CaptionsTrack["settings"],
      transition: normalizeTransition(plan.transition, `tracks[${i}]`),
      exit,
      ...(t ? { theme: { id: t.id, name: t.name, applied: themed } } : {}),
      ...(roleInfo ? { roles: roleInfo } : {}),
    });
  });
  if (!tracks.length) bad("No track selects any word.");

  // morph only between compatible looks: check every hand-over on each layer, else fall back to exit-entry
  for (const layer of [...new Set(tracks.map((t) => t.layer))]) {
    const seq = tracks
      .filter((t) => t.layer === layer)
      .flatMap((t) => t.doc.words.map((w) => ({ t, at: w.startMs })))
      .sort((a, b) => a.at - b.at);
    for (let k = 1; k < seq.length; k++) {
      const a = seq[k - 1]!.t;
      const b = seq[k]!.t;
      if (a === b || b.transition.type !== "morph") continue;
      const ok = morphCompatible({ id: baseIds.get(a.name)!, casing: String(a.style.casing) }, { id: baseIds.get(b.name)!, casing: String(b.style.casing) });
      if (!ok.ok) {
        b.transition = { type: "exit-entry", durationMs: Math.min(b.transition.durationMs, 320), overlapMs: 0 };
        warnings.push(`${b.name}: morph from ${a.name} is not possible (${ok.reason}); using exit-entry instead`);
      }
    }
  }

  const primary = [...tracks].sort((a, b) => a.layer - b.layer || b.doc.words.length - a.doc.words.length)[0]!;
  const doc = CaptionDocSchema.parse({ version: 2, language: input.language ?? "en", words: docWords.map((w, k) => (roles?.[k] ? { ...w, role: roles[k] } : w)) });
  return {
    doc: doc as CaptionsProps["doc"],
    style: primary.style,
    settings: primary.settings,
    look: primary.look,
    warnings,
    ...(theme ? { theme: { id: theme.id, name: theme.name, applied: primary.theme?.applied ?? [] } } : {}),
    ...(layout ? { layout: layout as CaptionsProps["layout"] } : {}),
    tracks,
  };
}
