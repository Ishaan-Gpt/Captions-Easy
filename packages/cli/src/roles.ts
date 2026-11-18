/**
 * Word roles in the API: normalise the caller's role input, assign the rest by rules, and compile each role into the
 * per-word levers the look really honours (measured: templates lookCapabilities). Only ever runs when the caller
 * passes `roles`, so default output is unchanged. See docs/composition.md.
 */
import { ProjectSettingsSchema, WORD_ROLES, type CaptionStyleV2, type ProjectSettings, type Word } from "@capseasy/shared";
import { assignRoles } from "@motion-ai/caption-engine/core";
import { lookCapabilities } from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { isColourful } from "./palette";
import type { PaletteRole, RoleLevers, RoleMap, RoleStyle, RoleSupport, RolesInput, SizeTier, ThemePalette, TranscriptWord, WordRole } from "./types";

export { WORD_ROLES };
export const SIZE_TIERS: Record<SizeTier, number> = { xs: 0.6, s: 0.78, m: 1, l: 1.18, xl: 1.4 };
const PALETTE_ROLES: readonly PaletteRole[] = ["ink", "paper", "accent", "accent2", "deep", "pop"];
const ENTRIES = ["none", "pop", "slam", "rise"] as const;

/** How roles render unless the caller changes it (then filtered to what the look honours). */
export const DEFAULT_ROLE_MAP: Required<RoleMap> = {
  connector: { size: "s" },
  key: { size: "l", color: "accent", asKey: true },
  number: { size: "l", color: "accent2", asKey: true, entry: "pop" },
  name: { color: "accent2" },
  title: { size: "l", color: "pop" },
  emphasis: { color: "accent", asKey: true, entry: "pop" },
};
export const DEFAULT_STAMPS: WordRole[] = ["key", "number"];

const bad = (m: string, details?: unknown): never => {
  throw new CaptionsEasyError("BAD_ARGS", m, details);
};
const isRole = (r: unknown): r is WordRole => typeof r === "string" && (WORD_ROLES as readonly string[]).includes(r);

export function validateRoleMap(map: unknown): RoleMap {
  if (map === undefined) return {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return bad("roleMap must be an object like { connector: { size: \"s\" } }.");
  const out: RoleMap = {};
  for (const [role, v] of Object.entries(map as Record<string, unknown>)) {
    if (!isRole(role)) bad(`roleMap: unknown role "${role}". Roles: ${WORD_ROLES.join(", ")}.`);
    if (!v || typeof v !== "object") bad(`roleMap.${role} must be an object.`);
    const s = v as Record<string, unknown>;
    const r: RoleStyle = {};
    for (const [k, x] of Object.entries(s)) {
      if (k === "size") r.size = typeof x === "string" && x in SIZE_TIERS ? (x as SizeTier) : bad(`roleMap.${role}.size must be one of: ${Object.keys(SIZE_TIERS).join(", ")}.`);
      else if (k === "color") r.color = x === "inherit" || PALETTE_ROLES.includes(x as PaletteRole) ? (x as PaletteRole) : bad(`roleMap.${role}.color must be inherit or a palette role: ${PALETTE_ROLES.join(", ")}.`);
      else if (k === "entry") r.entry = (ENTRIES as readonly unknown[]).includes(x) ? (x as RoleStyle["entry"]) : bad(`roleMap.${role}.entry must be one of: ${ENTRIES.join(", ")}.`);
      else if (k === "asKey" || k === "show") r[k] = typeof x === "boolean" ? x : bad(`roleMap.${role}.${k} must be true or false.`);
      else bad(`roleMap.${role}.${k} is not a role setting. Use size, color, entry, asKey, show.`);
    }
    out[role as WordRole] = r;
  }
  return out;
}

/** The role map a look really shows: the default (+ caller changes) minus every effect its layout ignores. */
export function effectiveRoleMap(levers: RoleLevers, over: RoleMap = {}): RoleMap {
  const out: RoleMap = {};
  for (const role of WORD_ROLES) {
    const r = { ...DEFAULT_ROLE_MAP[role], ...(over[role] ?? {}) };
    const e: RoleStyle = {};
    if (r.size && r.size !== "m" && levers.size) e.size = r.size;
    if (r.asKey && levers.emphasis) e.asKey = true;
    if (r.color && r.color !== "inherit" && levers.color) e.color = r.color;
    if (r.entry && r.entry !== "none" && levers.entry) e.entry = r.entry;
    if (r.show === false) e.show = false;
    out[role] = e;
  }
  return out;
}

export function roleSupport(lookId: string): RoleSupport {
  const levers = lookCapabilities(lookId).levers;
  const notes: string[] = [];
  if (levers.emphasis) notes.push("key words, numbers and stressed words are drawn the way this look draws its key word");
  if (levers.color) notes.push("roles can recolour words (numbers and names take accent2, titles pop)");
  if (levers.size) notes.push("two-tier sizing: connectors shrink, key words and numbers grow");
  if (levers.entry) notes.push("numbers and stressed words get their own pop entrance");
  if (!Object.values(levers).some(Boolean)) notes.push("a composed lockup that sets its own hierarchy: roles only work here as keyword-only stamps (stamps: true)");
  else notes.push("keyword-only stamps (stamps: true) work on every look");
  return { levers, map: effectiveRoleMap(levers), notes };
}

/** The look's own colours as palette roles (used for role colours when no theme is given). */
export function lookPalette(style: CaptionStyleV2): ThemePalette {
  const ink = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  const accent = style.active.effect === "box" ? (style.active.boxColor ?? style.active.color) : style.active.color;
  const heroFill = style.hero.fill?.type === "solid" ? style.hero.fill.color : undefined;
  const accent2 = heroFill && heroFill !== ink ? heroFill : style.glow.enabled && isColourful(style.glow.color) ? style.glow.color : accent;
  return { ink, paper: style.background.color, accent, accent2, deep: style.stroke.enabled ? style.stroke.color : "#000000", pop: accent2 };
}

/** Caller role input -> explicit roles by caller word index, and whether the rules fill the rest. */
export function normalizeRoles(input: RolesInput, words: TranscriptWord[]): { explicit: (WordRole | undefined)[]; auto: boolean } {
  const explicit: (WordRole | undefined)[] = words.map((w, i) => {
    if (w.role === undefined) return undefined;
    return isRole(w.role) ? w.role : bad(`words[${i}].role "${String(w.role)}" is not a role. Roles: ${WORD_ROLES.join(", ")}.`);
  });
  if (input === "auto") return { explicit, auto: true };
  if (input === "explicit") return { explicit, auto: false };
  if (Array.isArray(input)) {
    input.forEach((r, i) => {
      if (r === null || r === undefined) return;
      if (!isRole(r)) bad(`roles[${i}] "${String(r)}" is not a role. Roles: ${WORD_ROLES.join(", ")}.`);
      if (i >= words.length) bad(`roles has ${input.length} entries but there are ${words.length} words.`);
      explicit[i] = r;
    });
    return { explicit, auto: false };
  }
  if (input && typeof input === "object") {
    for (const [k, r] of Object.entries(input)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= words.length) bad(`roles key "${k}" must be a word index from 0 to ${words.length - 1}.`);
      if (!isRole(r)) bad(`roles["${k}"] "${String(r)}" is not a role. Roles: ${WORD_ROLES.join(", ")}.`);
      explicit[i] = r;
    }
    return { explicit, auto: false };
  }
  return bad('roles must be "auto", "explicit", an array of roles aligned with words, or { wordIndex: role }.');
}

/**
 * Map caller word indices onto the normalised doc words (normalisation sorts by time, drops noise and may romanize
 * the text), by start time in order.
 */
export function alignToDoc(callerWords: TranscriptWord[], explicit: (WordRole | undefined)[], doc: Word[]): (WordRole | undefined)[] {
  const queue = new Map<number, (WordRole | undefined)[]>();
  callerWords
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.text.trim())
    .sort((a, b) => a.w.startMs - b.w.startMs || a.i - b.i)
    .forEach(({ w, i }) => {
      const k = Math.round(w.startMs);
      queue.set(k, [...(queue.get(k) ?? []), explicit[i]]);
    });
  return doc.map((w) => queue.get(w.startMs)?.shift());
}

export interface CompiledRoles {
  words: Word[];
  counts: Partial<Record<WordRole, number>>;
  stamps: WordRole[] | null;
  warnings: string[];
}

/** Assign roles to the doc words and turn them into the levers this look honours. */
export function compileRoles(
  doc: Word[],
  opts: { lookId: string; lookName: string; explicit: (WordRole | undefined)[]; auto: boolean; settings: ProjectSettings; palette: ThemePalette; roleMap?: RoleMap; stamps?: boolean | WordRole[] },
): CompiledRoles {
  // key words are picked per phrase: one-word looks would otherwise make every word a key
  const phrase = opts.settings.maxWordsPerCard >= 3 ? opts.settings : { ...opts.settings, maxWordsPerCard: 3 };
  const roles = assignRoles(doc, { explicit: opts.explicit, auto: opts.auto, settings: phrase });
  const { levers } = lookCapabilities(opts.lookId);
  const map = effectiveRoleMap(levers, opts.roleMap);
  const stamps = opts.stamps === undefined || opts.stamps === false ? null : opts.stamps === true ? DEFAULT_STAMPS : opts.stamps;
  if (stamps) for (const r of stamps) if (!isRole(r)) bad(`stamps: "${String(r)}" is not a role. Roles: ${WORD_ROLES.join(", ")}.`);
  const counts: Partial<Record<WordRole, number>> = {};
  const words = doc.map((w, i) => {
    const role = roles[i];
    if (role) counts[role] = (counts[role] ?? 0) + 1;
    if (stamps && (!role || !stamps.includes(role))) return { ...w, ...(role ? { role } : {}), hidden: true };
    if (!role) return w;
    const r = map[role] ?? {};
    const out: Word = { ...w, role };
    if (r.show === false) out.hidden = true;
    if (r.asKey) out.emphasis = "hero";
    // a key-styled word already takes the look's key colour; only paint other colours
    if (r.color && !(r.asKey && r.color === "accent")) out.color = opts.palette[r.color as PaletteRole];
    if (r.size) out.scale = SIZE_TIERS[r.size];
    if (r.entry && r.entry !== "none") out.entry = r.entry;
    return out;
  });
  const warnings: string[] = [];
  if (!Object.values(levers).some(Boolean) && !stamps) warnings.push(`${opts.lookName} sets its own word hierarchy and ignores per-word role effects; use stamps or a look whose describeLook().roles.levers are on`);
  if (stamps && !words.some((w) => !w.hidden)) warnings.push(`no word has a stamp role (${stamps.join(", ")}): the output will have no captions`);
  return { words, counts, stamps, warnings };
}

/** The roles the rules give these words (same order); explicit `words[].role` values are kept. */
export function assignWordRoles(words: TranscriptWord[], opts: { maxWordsPerCard?: number } = {}): (WordRole | undefined)[] {
  if (!Array.isArray(words)) bad("words must be an array of { text, startMs, endMs }.");
  const { explicit } = normalizeRoles("auto", words);
  const doc = words.map((w, i) => ({ id: `r${i}`, text: String(w.text ?? ""), startMs: Number(w.startMs) || 0, endMs: Number(w.endMs) || 0 })) as Word[];
  const settings = ProjectSettingsSchema.parse(opts.maxWordsPerCard ? { maxWordsPerCard: opts.maxWordsPerCard } : {});
  return assignRoles(doc, { explicit, auto: true, settings });
}
