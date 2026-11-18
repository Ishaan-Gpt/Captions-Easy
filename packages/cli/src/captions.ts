/**
 * words + look (+ overrides) -> validated CaptionedVideo props. Overrides are checked against the controls the look's
 * template really honours, so an agent gets a clear error instead of a setting that silently does nothing.
 */
import { CaptionDocSchema, CaptionStyleSchema, ProjectSettingsSchema, type CaptionStyleV2 } from "@capseasy/shared";
import { normalizeTokens } from "@motion-ai/caption-engine/core";
import { KNOWN_FONTS, getTemplate } from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { resolveLookRef, styleFor } from "./custom";
import { CONTROL_DEFS, controlByKey, describeLook, isControlKey, lookBase, rangeOf, resolveLook, settingControls, visibility } from "./looks";
import { flattenOverrides, getKey, setKey } from "./keys";
import { alignToDoc, compileRoles, lookPalette, normalizeRoles, validateRoleMap } from "./roles";
import { validateLayout } from "./safety";
import { resolveTheme } from "./themes";
import { buildTrackCaptions } from "./tracks";
import type { BuildCaptionsInput, CaptionsProps, LookRef, SettingControl, TranscriptWord } from "./types";

const NAMED_COLORS = new Set(["transparent", "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "cyan", "magenta", "gold", "silver", "gray", "grey", "lime", "navy", "teal", "maroon", "olive", "aqua", "fuchsia", "violet", "indigo", "coral", "crimson", "turquoise"]);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgba?|hsla?)\(\s*[-\d.%\s,/]+\)$/i;
export const isColor = (v: string) => HEX.test(v) || FUNC.test(v) || NAMED_COLORS.has(v.toLowerCase());

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

function bad(message: string, details?: unknown): never {
  throw new CaptionsEasyError("BAD_OVERRIDE", message, details);
}

interface Spec {
  key: string;
  type: string;
  min?: number;
  max?: number;
  options?: readonly (string | number)[];
}

/** Coerce (CLI strings) and check one value against its control. */
export function coerceValue(spec: Spec, raw: unknown, what = "style"): unknown {
  const k = spec.key;
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) bad(`${k} must be a number (got ${JSON.stringify(raw)}).`);
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) bad(`${k} must be between ${spec.min} and ${spec.max} (got ${n}).`, { key: k, min: spec.min, max: spec.max });
      return n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase();
      if (TRUE.has(s)) return true;
      if (FALSE.has(s)) return false;
      return bad(`${k} must be true or false (got ${JSON.stringify(raw)}).`);
    }
    case "color": {
      const s = String(raw).trim();
      if (!isColor(s)) bad(`${k} must be a colour like "#FFE600", "rgba(0,0,0,0.6)" or "white" (got ${JSON.stringify(raw)}).`);
      return s;
    }
    case "font": {
      const s = String(raw).trim();
      const hit = KNOWN_FONTS.find((f) => f.toLowerCase() === s.toLowerCase());
      if (!hit) bad(`${k}: "${s}" is not a bundled font. Use one of: ${KNOWN_FONTS.join(", ")}.`, { key: k, options: KNOWN_FONTS });
      return hit;
    }
    case "enum": {
      const s = String(raw).trim();
      if (!spec.options?.includes(s)) bad(`${k} must be one of: ${spec.options?.join(", ")} (got ${JSON.stringify(raw)}).`, { key: k, options: spec.options });
      return s;
    }
  }
  return bad(`Unsupported ${what} key ${k}.`);
}

/** Apply style overrides to a look's style. Unknown or unsupported keys are errors that list what is allowed. */
export function applyStyleOverrides(lookRef: LookRef, base: CaptionStyleV2, overrides: Record<string, unknown>, warnings: string[]): CaptionStyleV2 {
  const look = resolveLook(lookRef);
  const t = getTemplate(look.templateId);
  const pairs = flattenOverrides(overrides, isControlKey);
  let style = base;
  const touched: string[] = [];
  // prerequisites first ("stroke.enabled" before "stroke.width"), so order in the input never matters
  const rank = (k: string) => (CONTROL_DEFS.findIndex((d) => d.key === k) === -1 ? 999 : CONTROL_DEFS.some((d) => d.needs?.label.startsWith(`${k}=`)) ? 0 : 1);
  pairs.sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [key, raw] of pairs) {
    const def = controlByKey(key);
    if (!def) {
      const valid = describeLook(lookRef).controls.map((c) => c.key);
      bad(`Unknown style key "${key}". ${look.name} (#${look.number}) accepts: ${valid.join(", ")}.`, { key, validKeys: valid });
    }
    const vis = visibility(def, t, style);
    if (!vis.visible) {
      const valid = describeLook(lookRef).controls.map((c) => c.key);
      bad(`${look.name} (#${look.number}) does not use "${key}" (its design ignores it), so it was rejected rather than silently doing nothing. It accepts: ${valid.join(", ")}.`, { key, validKeys: valid });
    }
    const options = def.options && def.type === "enum" ? def.options(t) : undefined;
    const value = coerceValue({ key, type: def.type, ...rangeOf(def, getKey(base, key)), options }, raw);
    style = setKey(style, key, value);
    touched.push(key);
  }
  // a setting whose switch is off: turn the switch on when that is harmless, else say what it needs
  for (const key of touched) {
    const def = controlByKey(key)!;
    const v = visibility(def, t, style);
    if (v.visible && v.needs) {
      if (v.needs.auto) {
        style = v.needs.apply(style);
        warnings.push(`set ${v.needs.label} because ${key} only shows when it is on`);
      } else {
        bad(`"${key}" only takes effect when ${v.needs.label}. Set that too (it changes the look's motion, so it is not switched on automatically).`, { key, dependsOn: v.needs.label });
      }
    }
  }
  const parsed = CaptionStyleSchema.safeParse(style);
  if (!parsed.success) bad(`The overrides produce an invalid style: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function applySettingsOverrides(controls: SettingControl[], base: Record<string, unknown>, overrides: Record<string, unknown>, lookLabel: string, warnings: string[]) {
  const out: Record<string, unknown> = { ...base };
  for (const [key, raw] of Object.entries(overrides)) {
    const c = controls.find((x) => x.key === key);
    if (!c) {
      if (key === "maxWordsPerCard" || key === "maxLines" || key === "maxCharsPerLine") {
        warnings.push(`${key} ignored: ${lookLabel} is composed for a fixed number of words/lines`);
        continue;
      }
      throw new CaptionsEasyError("BAD_SETTINGS", `Unknown setting "${key}". Settings: ${controls.map((x) => x.key).join(", ")}.`, { key, validKeys: controls.map((x) => x.key) });
    }
    try {
      out[key] = coerceValue(c, raw, "setting");
    } catch (e) {
      throw new CaptionsEasyError("BAD_SETTINGS", (e as Error).message, (e as CaptionsEasyError).details);
    }
  }
  const parsed = ProjectSettingsSchema.safeParse(out);
  if (!parsed.success) throw new CaptionsEasyError("BAD_SETTINGS", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

/** Validate caller words (any order, untrimmed) into clean, monotonic, id-stamped doc words. */
export function toDocWords(words: TranscriptWord[], durationMs?: number, romanize = false, hinglishSpelling?: "off" | "creator") {
  if (!Array.isArray(words)) throw new CaptionsEasyError("BAD_WORDS", "words must be an array of { text, startMs, endMs }.");
  words.forEach((w, i) => {
    if (!w || typeof w.text !== "string" || !Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) {
      throw new CaptionsEasyError("BAD_WORDS", `words[${i}] must be { text: string, startMs: number, endMs: number } (milliseconds), got ${JSON.stringify(w)}.`);
    }
    if (w.endMs < w.startMs) throw new CaptionsEasyError("BAD_WORDS", `words[${i}] ("${w.text}") ends before it starts.`);
  });
  const doc = normalizeTokens(
    words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
    // settings.romanize: Devanagari words become Hinglish as creators type it (built-in romanizer)
    { ...(durationMs ? { durationMs } : {}), ...(romanize ? { romanize: true } : {}), ...(hinglishSpelling === "creator" ? { hinglishSpelling } : {}) },
  );
  // deterministic ids (0.2.0): same input -> identical props -> identical pixels (seeded looks key off word ids)
  return doc.map((w, i) => ({ ...w, id: wordId(i, w.text, w.startMs, w.endMs) }));
}

/** Stable 12-hex word id from position + content + timing (two FNV-1a 32-bit passes, same shape as the old random ids). */
export function wordId(index: number, text: string, startMs: number, endMs: number): string {
  const key = `${index}|${text}|${startMs}|${endMs}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ index;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).slice(0, 12);
}

/**
 * Turn timed words + a look (+ optional style and pacing overrides) into validated props for the CaptionedVideo
 * composition. Pure and synchronous: no files, no network. Themes, custom looks and word roles are opt-in: without
 * them the result is exactly the 0.1.x result.
 */
export function buildCaptions(input: BuildCaptionsInput & { durationMs?: number }): CaptionsProps {
  // several looks in one video (opt-in): see tracks.ts
  if (input.tracks !== undefined) return buildTrackCaptions(input);
  if (input.look === undefined || input.look === null || input.look === "") {
    throw new CaptionsEasyError("BAD_ARGS", "buildCaptions needs a look: a number (12), an id (\"hormozi_box\") or a custom look. listLooks() or recommendLooks() helps you pick one.", { field: "look" });
  }
  const { look, custom } = resolveLookRef(input.look as LookRef);
  const warnings: string[] = [];
  const base = lookBase(look);
  const themeRef = input.theme ?? custom?.theme;
  const theme = themeRef === undefined ? undefined : resolveTheme(themeRef);
  let style = base.style;
  let themed: string[] = [];
  if (theme || custom) ({ style, themed } = styleFor(look, theme, custom?.overrides ?? {}, warnings));
  if (input.overrides && Object.keys(input.overrides).length) style = applyStyleOverrides(look.number!, style, input.overrides, warnings);
  const label = `${look.name} (#${look.number})`;
  const settings = applySettingsOverrides(settingControls(look, base.settings), base.settings, { ...(custom?.settings ?? {}), ...(input.settings ?? {}) }, label, warnings);
  let words = toDocWords(input.words, input.durationMs, settings.romanize === true, settings.hinglishSpelling);
  const layout = input.layout === undefined ? undefined : validateLayout(input.layout);
  if (!words.length) warnings.push("no words to caption: the output will have no captions");

  let roles: CaptionsProps["roles"];
  const rolesIn = input.roles ?? (input.stamps ? "auto" : undefined);
  if (rolesIn !== undefined || input.roleMap !== undefined) {
    if (rolesIn === undefined) throw new CaptionsEasyError("BAD_ARGS", "roleMap needs roles (e.g. roles: \"auto\").");
    const roleMap = validateRoleMap(input.roleMap);
    const { explicit, auto } = normalizeRoles(rolesIn, input.words);
    const compiled = compileRoles(words, {
      lookId: look.id, lookName: label, explicit: alignToDoc(input.words, explicit, words), auto, settings,
      palette: theme?.palette ?? lookPalette(style), roleMap, stamps: input.stamps,
    });
    words = compiled.words;
    warnings.push(...compiled.warnings);
    roles = { counts: compiled.counts, levers: describeLook(look.number!).roles.levers, stamps: compiled.stamps };
  }

  const doc = CaptionDocSchema.parse({ version: 2, language: input.language ?? "en", words });
  return {
    doc: doc as CaptionsProps["doc"],
    style: style as CaptionsProps["style"],
    settings: settings as CaptionsProps["settings"],
    look: custom ? { number: look.number ?? 0, id: custom.id, name: custom.name, custom: true, baseNumber: look.number ?? 0 } : { number: look.number ?? 0, id: look.id, name: look.name },
    warnings,
    ...(theme ? { theme: { id: theme.id, name: theme.name, applied: themed } } : {}),
    ...(roles ? { roles } : {}),
    ...(layout ? { layout: layout as CaptionsProps["layout"] } : {}),
  };
}
