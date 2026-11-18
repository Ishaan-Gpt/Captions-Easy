/**
 * Custom looks: a built-in look + validated overrides (+ an optional theme and pacing), with a stable id, as plain
 * JSON. The registry lives in this process only (registerLook / --looks-file); nothing is written to disk unless a
 * path is given (saveLooksFile).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookDefinition } from "@capseasy/templates";
import { applySettingsOverrides, applyStyleOverrides } from "./captions";
import { CaptionsEasyError } from "./errors";
import { flattenOverrides, getKey } from "./keys";
import { controlValue, describeLook, isControlKey, lookBase, resolveLook, settingControls } from "./looks";
import { resolveTheme, themeOverrides, THEMES } from "./themes";
import type { ChangedControl, CustomLook, DeriveLookOptions, LookRef, StyleOverrides, Theme, ThemeInput, ThemeRef } from "./types";

const registry = new Map<string, CustomLook>();

const bad = (m: string, details?: unknown): never => {
  throw new CaptionsEasyError("BAD_OVERRIDE", m, details);
};

/** JSON with sorted keys, so the id does not depend on key order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
/** FNV-1a 32-bit, base36 (7 chars) */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}
const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "look";

export const isCustomLook = (v: unknown): v is CustomLook => !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "custom";

/** Store a theme the way a custom look carries it: a named theme by id, a custom one as its validated tokens. */
const themeForJson = (t: Theme): string | ThemeInput => (THEMES.some((x) => x.id === t.id && JSON.stringify(x) === JSON.stringify(t)) ? t.id : { id: t.id, name: t.name, description: t.description, mood: t.mood, tags: t.tags, palette: t.palette, fonts: t.fonts, motion: t.motion });

/** base style -> theme -> overrides, validated against the base look's controls. */
export function styleFor(base: LookDefinition, theme: Theme | undefined, overrides: Record<string, unknown>, warnings: string[]): { style: CaptionStyleV2; themed: string[] } {
  let style = lookBase(base).style;
  let themed: string[] = [];
  if (theme) {
    const t = themeOverrides(base, theme);
    if (Object.keys(t.overrides).length) style = applyStyleOverrides(base.number!, style, t.overrides, warnings);
    themed = Object.keys(t.overrides);
  }
  if (Object.keys(overrides).length) style = applyStyleOverrides(base.number!, style, overrides, warnings);
  return { style, themed };
}

/** Every control (and pacing setting) whose value differs from the base look. */
function changedControls(base: LookDefinition, style: CaptionStyleV2, settings: Record<string, unknown> | undefined): ChangedControl[] {
  const d = describeLook(base.number!);
  const out: ChangedControl[] = [];
  for (const c of d.controls) {
    const to = controlValue(base.templateId, style, c.key);
    if (stable(to) !== stable(c.default)) out.push({ key: c.key, from: c.default, to });
  }
  const s = lookBase(base).settings as unknown as Record<string, unknown>;
  for (const [key, to] of Object.entries(settings ?? {})) if (stable(s[key]) !== stable(to)) out.push({ key, from: s[key], to });
  return out;
}

/**
 * Derive a named custom look from a built-in (or another custom) look. Overrides are validated exactly like
 * buildCaptions overrides (BAD_OVERRIDE / BAD_SETTINGS / BAD_THEME). Returns plain JSON; register it with
 * registerLook() to refer to it by id.
 */
export function deriveLook(base: LookRef | CustomLook, overrides: StyleOverrides = {}, opts: DeriveLookOptions): CustomLook {
  if (!opts || typeof opts.name !== "string" || !opts.name.trim()) bad("deriveLook needs a name: deriveLook(base, overrides, { name: \"Brand Box\" }).");
  if (overrides && (typeof overrides !== "object" || Array.isArray(overrides))) bad("overrides must be an object of style keys.");
  // deriving from a custom look folds it into its base
  const parent = isCustomLook(base) ? base : typeof base === "string" && base.startsWith("custom:") ? getCustomLook(base) : undefined;
  const look = resolveLook(parent ? parent.baseNumber : (base as LookRef));
  const merged: Record<string, unknown> = { ...(parent?.overrides ?? {}) };
  for (const [k, v] of flattenOverrides(overrides ?? {}, isControlKey)) merged[k] = v;
  const themeRef: ThemeRef | undefined = opts.theme ?? parent?.theme;
  const theme = themeRef === undefined ? undefined : resolveTheme(themeRef);
  const warnings: string[] = [];
  const { style } = styleFor(look, theme, merged, warnings);
  // store the coerced values ("80" -> 80) so the JSON is canonical
  const flat: Record<string, unknown> = {};
  for (const k of Object.keys(merged)) flat[k] = getKey(style, k);
  const settingsIn = { ...(parent?.settings ?? {}), ...(opts.settings ?? {}) };
  let settings: Record<string, unknown> | undefined;
  if (Object.keys(settingsIn).length) {
    const lb = lookBase(look);
    const all = applySettingsOverrides(settingControls(look, lb.settings), lb.settings, settingsIn, `${look.name} (#${look.number})`, warnings) as unknown as Record<string, unknown>;
    settings = Object.fromEntries(Object.keys(settingsIn).filter((k) => k in all).map((k) => [k, all[k]]));
  }
  const themeJson = theme ? themeForJson(theme) : undefined;
  const id = `custom:${slug(opts.name)}-${shortHash(stable({ base: look.id, overrides: flat, theme: themeJson ?? null, settings: settings ?? null }))}`;
  return {
    kind: "custom",
    id,
    name: opts.name.trim(),
    ...(opts.description ? { description: opts.description } : parent?.description ? { description: parent.description } : {}),
    baseNumber: look.number!,
    baseId: look.id,
    overrides: flat,
    ...(settings ? { settings } : {}),
    ...(themeJson !== undefined ? { theme: themeJson } : {}),
    changed: changedControls(look, style, settings),
  };
}

/** Validate plain JSON (e.g. read from a file) back into a custom look; keeps its id when it has a valid one. */
export function validateCustomLook(input: unknown): CustomLook {
  if (!isCustomLook(input)) bad('A custom look must be an object with kind: "custom" (from deriveLook).');
  const c = input as CustomLook;
  const base = c.baseId ?? c.baseNumber;
  if (base === undefined) bad(`custom look "${c.name ?? c.id}" needs baseId or baseNumber.`);
  const again = deriveLook(base, c.overrides ?? {}, { name: c.name, description: c.description, theme: c.theme, settings: c.settings });
  return typeof c.id === "string" && /^custom:[\p{L}\p{N}-]+$/u.test(c.id) ? { ...again, id: c.id } : again;
}

/** Add custom looks to this process's registry (validated). Returns what was registered. */
export function registerLook(look: CustomLook): CustomLook;
export function registerLook(looks: CustomLook[]): CustomLook[];
export function registerLook(input: CustomLook | CustomLook[]): CustomLook | CustomLook[] {
  const list = (Array.isArray(input) ? input : [input]).map(validateCustomLook);
  for (const l of list) registry.set(l.id, l);
  return Array.isArray(input) ? list : list[0]!;
}
export const unregisterLook = (id: string): boolean => registry.delete(id);
export const listCustomLooks = (): CustomLook[] => [...registry.values()];

export function getCustomLook(id: string): CustomLook {
  return (
    registry.get(id) ??
    (() => {
      throw new CaptionsEasyError("UNKNOWN_LOOK", `Unknown custom look "${id}". Register it first: registerLook(json) in code, --looks-file <file> on the CLI, or derive_look over MCP.`, { registered: [...registry.keys()] });
    })()
  );
}

/** Any look reference -> the built-in look it renders with, plus the custom layer when there is one. */
export function resolveLookRef(ref: LookRef | CustomLook): { look: LookDefinition; custom?: CustomLook } {
  if (isCustomLook(ref)) {
    const c = registry.get(ref.id) && stable(registry.get(ref.id)) === stable(ref) ? ref : validateCustomLook(ref);
    return { look: resolveLook(c.baseNumber), custom: c };
  }
  if (typeof ref === "string" && ref.trim().toLowerCase().startsWith("custom:")) {
    const c = getCustomLook(ref.trim());
    return { look: resolveLook(c.baseNumber), custom: c };
  }
  return { look: resolveLook(ref as LookRef) };
}

/** Read custom looks from a JSON file (an array, or { looks: [...] }) and register them. */
export function loadLooksFile(path: string): CustomLook[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (e) {
    throw new CaptionsEasyError((e as { code?: string }).code === "ENOENT" ? "FILE_NOT_FOUND" : "BAD_ARGS", `Could not read custom looks from ${path}: ${(e as Error).message}`);
  }
  const list = Array.isArray(raw) ? raw : (raw as { looks?: unknown })?.looks;
  if (!Array.isArray(list)) throw new CaptionsEasyError("BAD_ARGS", `${path} must hold an array of custom looks or { "looks": [...] }.`);
  return registerLook(list as CustomLook[]);
}

/** Write custom looks to a JSON file ({ looks: [...] }), replacing entries with the same id. */
export function saveLooksFile(path: string, looks: CustomLook[]): string {
  const p = resolve(path);
  let existing: CustomLook[] = [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    existing = (Array.isArray(raw) ? raw : raw?.looks ?? []) as CustomLook[];
  } catch {
    existing = [];
  }
  const ids = new Set(looks.map((l) => l.id));
  writeFileSync(p, `${JSON.stringify({ looks: [...existing.filter((l) => !ids.has(l.id)), ...looks] }, null, 2)}\n`);
  return p;
}
