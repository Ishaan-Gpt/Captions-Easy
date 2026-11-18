/**
 * The public catalogue: built-in looks plus custom looks, described plain or under a theme.
 * (looks.ts stays the built-in catalogue; this layer adds custom looks and themes on top.)
 */
import { isCustomLook, listCustomLooks, resolveLookRef, styleFor } from "./custom";
import { controlValue, describeLook, listLooks, lookBase } from "./looks";
import { resolveTheme, themeOverrides } from "./themes";
import type { CustomLook, CustomLookDetails, CustomLookSummary, DescribeLookOptions, ListLooksOptions, LookDetails, LookRef, LookSummary } from "./types";

function customSummary(c: CustomLook): CustomLookSummary {
  const { number: _n, guide, ...base } = listLooks().find((l) => l.id === c.baseId) ?? (describeLook(c.baseNumber) as LookSummary);
  return {
    ...base,
    kind: "custom",
    id: c.id,
    name: c.name,
    section: "custom",
    tags: ["Custom", ...base.tags],
    description: c.description ?? `${base.name} (#${c.baseNumber}), customised: ${c.changed.map((x) => x.key).join(", ") || "no changes"}`,
    ...(typeof c.settings?.maxWordsPerCard === "number" ? { wordsPerCard: c.settings.maxWordsPerCard } : {}),
    ...(guide ? { guide } : {}),
    baseNumber: c.baseNumber,
    baseId: c.baseId,
  };
}

/** Gallery looks, then (with includeCustom) the custom looks registered in this process. */
export function listAllLooks(opts: ListLooksOptions = {}): (LookSummary | CustomLookSummary)[] {
  const gallery = listLooks(opts);
  if (!opts.includeCustom) return gallery;
  const terms = (opts.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const custom = listCustomLooks()
    .map(customSummary)
    .filter((l) => {
      if (opts.section && opts.section.toLowerCase() !== "custom") return false;
      const hay = `${l.id} ${l.name} ${l.description} ${l.tags.join(" ")} custom`.toLowerCase();
      return terms.every((t) => hay.includes(t)) && (opts.tags ?? []).every((t) => l.tags.some((x) => x.toLowerCase().includes(t.toLowerCase())));
    });
  return [...gallery, ...custom];
}

/** One look's guide, defaults and controls; custom looks and themes show the values they render with. */
export function describeAnyLook(ref: LookRef | CustomLook, opts: DescribeLookOptions = {}): LookDetails | CustomLookDetails {
  const { look, custom } = resolveLookRef(ref);
  const d = describeLook(look.number!);
  const themeRef = opts.theme ?? custom?.theme;
  if (themeRef === undefined && !custom) return d;
  const theme = themeRef === undefined ? undefined : resolveTheme(themeRef);
  const { style } = styleFor(look, theme, custom?.overrides ?? {}, []);
  const valueOf = (key: string) => controlValue(look.templateId, style, key);
  const controls = d.controls.map((c) => ({ ...c, default: valueOf(c.key) ?? c.default }));
  const defaults = Object.fromEntries(controls.map((c) => [c.key, c.default]));
  const baseSettings = lookBase(look).settings as unknown as Record<string, unknown>;
  const settings = d.settings.map((s) => (custom?.settings && s.key in custom.settings ? { ...s, default: custom.settings[s.key] } : { ...s, default: baseSettings[s.key] ?? s.default }));
  const out: LookDetails = { ...d, defaults, controls, settings, ...(theme ? { theme: themeOverrides(look, theme).application } : {}) };
  if (!custom) return out;
  const { number: _n, ...rest } = out;
  return { ...rest, ...customSummary(custom), retired: false, defaults, controls, settings, guide: d.guide, roles: d.roles, kind: "custom", custom: { baseNumber: custom.baseNumber, baseId: custom.baseId, changed: custom.changed } } as CustomLookDetails;
}

export { isCustomLook };
