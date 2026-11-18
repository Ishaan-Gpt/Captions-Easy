/**
 * Themes: one brand across every look in a video. A theme is tokens (palette roles, three fonts, motion feel) and a
 * fixed mapping from those tokens onto each look's EXISTING controls, only the ones its design honours without
 * switching anything on (visible, no `dependsOn`). Polarity is kept: dark-on-plate looks stay dark-on-plate, neutral
 * "material" gradients (metal, chrome) stay, a look without a colour accent stays without one. See
 * docs/composition.md.
 */
import type { CaptionStyleV2 } from "@capseasy/shared";
import { KNOWN_FONTS, getFontEntry, getTemplate, type LookDefinition } from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { getKey } from "./keys";
import { controlByKey, lookBase, rangeOf, visibility } from "./looks";
import { DEVANAGARI_FONTS } from "./meta";
import { isColourful, isLight, mostReadable, sameColour } from "./palette";
import type { LookMood, Script, Theme, ThemeApplication, ThemeEasing, ThemeInput, ThemeMotion, ThemeRef } from "./types";

const t = (x: Omit<Theme, "scripts">): Theme => ({ ...x, scripts: scriptsOf(x.fonts) });

function scriptsOf(fonts: Theme["fonts"]): Script[] {
  return [fonts.display, fonts.text, fonts.accent].every((f) => DEVANAGARI_FONTS.has(f)) ? ["latin", "devanagari"] : ["latin"];
}

/** The named themes, in a stable order. */
export const THEMES: readonly Theme[] = [
  t({
    id: "mono-editorial", name: "Mono Editorial", mood: "clean", tags: ["minimal", "editorial", "black and white"],
    description: "Warm off-white type, ink-black plates and a silver accent; key words switch to an italic serif. Magazine calm.",
    palette: { ink: "#F7F5F0", paper: "#F7F5F0", accent: "#C9CDD3", accent2: "#9AA0A8", deep: "#111111", pop: "#E4E0D6" },
    fonts: { display: "Inter Tight", text: "Inter", accent: "Instrument Serif" },
    motion: { intensity: 0.7, easing: "smooth", entrySpeed: 0.9, stagger: "look" },
  }),
  t({
    id: "creator-yellow", name: "Creator Yellow", mood: "hype", tags: ["bold", "creator", "yellow"],
    description: "The proven talking-head palette: white caps, punchy yellow key words, black outlines, a cyan second accent.",
    palette: { ink: "#FFFFFF", paper: "#FFE600", accent: "#FFE600", accent2: "#00E0FF", deep: "#0A0A0A", pop: "#FF3B30" },
    fonts: { display: "Montserrat", text: "Montserrat", accent: "Anton" },
    motion: { intensity: 1.25, easing: "snappy", entrySpeed: 1.2, stagger: "look" },
  }),
  t({
    id: "neon-night", name: "Neon Night", mood: "edgy", tags: ["neon", "night", "magenta", "cyan"],
    description: "Magenta and cyan light on near-black plates, rounded wide type and a neon tube accent. For dark footage.",
    palette: { ink: "#F5F3FF", paper: "#16111F", accent: "#FF2BD6", accent2: "#2BF0FF", deep: "#07050D", pop: "#B6FF3B" },
    fonts: { display: "Unbounded", text: "Outfit", accent: "Tilt Neon" },
    motion: { intensity: 1.1, easing: "snappy", entrySpeed: 1, stagger: "look" },
  }),
  t({
    id: "luxe-gold", name: "Luxe Gold", mood: "luxe", tags: ["luxury", "gold", "serif"],
    description: "Ivory roman capitals with antique gold, slow and composed. Fashion, perfume, jewellery, hospitality.",
    palette: { ink: "#F7F1E3", paper: "#F3E9D2", accent: "#D4AF37", accent2: "#F3E5AB", deep: "#1A140B", pop: "#B8860B" },
    fonts: { display: "Cinzel", text: "Cormorant Garamond", accent: "Playfair Display" },
    motion: { intensity: 0.6, easing: "gentle", entrySpeed: 0.75, stagger: "look" },
  }),
  t({
    id: "clean-corporate", name: "Clean Corporate", mood: "clean", tags: ["business", "linkedin", "blue"],
    description: "Crisp white sans, confident blue key words, navy plates and a green second accent. LinkedIn and explainers.",
    palette: { ink: "#FFFFFF", paper: "#FFFFFF", accent: "#2F6BFF", accent2: "#18C29C", deep: "#0B1F3A", pop: "#FFB020" },
    fonts: { display: "Plus Jakarta Sans", text: "Inter", accent: "Plus Jakarta Sans" },
    motion: { intensity: 0.7, easing: "smooth", entrySpeed: 1, stagger: "look" },
  }),
  t({
    id: "pastel-pop", name: "Pastel Pop", mood: "playful", tags: ["pastel", "cute", "pink"],
    description: "Rounded friendly type, candy pink and sky blue accents on blush plates, a bouncy feel. Lifestyle and beauty.",
    palette: { ink: "#FFFFFF", paper: "#FFE3EC", accent: "#FF8FB1", accent2: "#8FD3FF", deep: "#3B2A4A", pop: "#C3A6FF" },
    fonts: { display: "Fredoka", text: "Nunito", accent: "Pacifico" },
    motion: { intensity: 1.15, easing: "snappy", entrySpeed: 1.05, stagger: "look" },
  }),
  t({
    id: "sport-red", name: "Sport Red", mood: "hype", tags: ["sport", "fitness", "red"],
    description: "Condensed athletic caps, racing red with a yellow flash, hard and fast. Fitness, sport, hype edits.",
    palette: { ink: "#FFFFFF", paper: "#E10600", accent: "#FF1E1E", accent2: "#FFD500", deep: "#0A0A0A", pop: "#FFD500" },
    fonts: { display: "Big Shoulders", text: "Barlow Semi Condensed", accent: "Anton" },
    motion: { intensity: 1.4, easing: "snappy", entrySpeed: 1.35, stagger: "look" },
  }),
  t({
    id: "tech-cyan", name: "Tech Cyan", mood: "techy", tags: ["tech", "ai", "cyan", "mono"],
    description: "Cool grotesk type with electric cyan and mint on deep navy plates, a mono accent. AI, SaaS, dev content.",
    palette: { ink: "#E6FBFF", paper: "#0B1620", accent: "#00E5FF", accent2: "#7CFFB2", deep: "#02070B", pop: "#FF4FD8" },
    fonts: { display: "Space Grotesk", text: "Inter", accent: "JetBrains Mono" },
    motion: { intensity: 1, easing: "snappy", entrySpeed: 1.1, stagger: "look" },
  }),
  t({
    id: "earthy-film", name: "Earthy Film", mood: "cinematic", tags: ["film", "warm", "earthy"],
    description: "Parchment text, terracotta and sage accents, soft serif display, unhurried. Travel, food, documentary.",
    palette: { ink: "#F2E8D5", paper: "#E9DCC0", accent: "#E07A3F", accent2: "#A3B18A", deep: "#2B2118", pop: "#C8553D" },
    fonts: { display: "Fraunces", text: "DM Sans", accent: "Instrument Serif" },
    motion: { intensity: 0.65, easing: "gentle", entrySpeed: 0.8, stagger: "look" },
  }),
  t({
    id: "bollywood-masala", name: "Bollywood Masala", mood: "playful", tags: ["desi", "hinglish", "hindi", "festive"],
    description: "Festive rani pink and marigold on deep maroon, round Indian display type that also draws Devanagari.",
    palette: { ink: "#FFF8E7", paper: "#FFB000", accent: "#FF2E63", accent2: "#FFC300", deep: "#3A0A1E", pop: "#08D9D6" },
    fonts: { display: "Baloo 2", text: "Mukta", accent: "Baloo 2" },
    motion: { intensity: 1.3, easing: "snappy", entrySpeed: 1.15, stagger: "look" },
  }),
];

const MOODS: readonly LookMood[] = ["calm", "warm", "playful", "hype", "dramatic", "luxe", "edgy", "techy", "cinematic", "clean", "retro", "dreamy"];
const EASINGS: readonly ThemeEasing[] = ["look", "smooth", "snappy", "gentle", "linear"];
const STAGGERS = ["look", "none", "word", "char"] as const;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const byId = new Map(THEMES.map((x) => [x.id, x]));

const bad = (m: string, details?: unknown): never => {
  throw new CaptionsEasyError("BAD_THEME", m, details);
};

/** Validate a custom theme (only `id` is required; the rest falls back to `extends`). */
export function validateTheme(input: unknown): Theme {
  if (!input || typeof input !== "object" || Array.isArray(input)) return bad("A theme must be an object like { id, palette, fonts, motion }.");
  const o = input as ThemeInput;
  if (typeof o.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(o.id)) bad(`theme.id must be a lowercase slug (a-z, 0-9, "-"), got ${JSON.stringify(o.id)}.`);
  const baseId = o.extends ?? "mono-editorial";
  const base = byId.get(baseId) ?? bad(`theme.extends: unknown theme "${baseId}". Named themes: ${THEMES.map((x) => x.id).join(", ")}.`);
  const palette = { ...base.palette };
  for (const [k, v] of Object.entries(o.palette ?? {})) {
    if (!(k in palette)) bad(`theme.palette.${k} is not a palette role. Roles: ${Object.keys(palette).join(", ")}.`);
    if (typeof v !== "string" || !HEX.test(v.trim())) bad(`theme.palette.${k} must be a hex colour like "#FFE600" (got ${JSON.stringify(v)}).`);
    palette[k as keyof typeof palette] = v.trim().toUpperCase();
  }
  const fonts = { ...base.fonts };
  for (const [k, v] of Object.entries(o.fonts ?? {})) {
    if (!(k in fonts)) bad(`theme.fonts.${k} is not a font role. Roles: display, text, accent.`);
    const hit = KNOWN_FONTS.find((f) => f.toLowerCase() === String(v).trim().toLowerCase());
    if (!hit) bad(`theme.fonts.${k}: "${v}" is not a bundled font. Use one of: ${KNOWN_FONTS.join(", ")}.`, { options: KNOWN_FONTS });
    fonts[k as keyof typeof fonts] = hit!;
  }
  const motion: ThemeMotion = { ...base.motion };
  const m = o.motion ?? {};
  const num = (k: "intensity" | "entrySpeed", min: number, max: number) => {
    const v = m[k];
    if (v === undefined) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) bad(`theme.motion.${k} must be a number from ${min} to ${max} (got ${JSON.stringify(v)}).`);
    motion[k] = v;
  };
  num("intensity", 0.4, 1.6);
  num("entrySpeed", 0.5, 2);
  if (m.easing !== undefined) motion.easing = EASINGS.includes(m.easing) ? m.easing : bad(`theme.motion.easing must be one of: ${EASINGS.join(", ")}.`);
  if (m.stagger !== undefined) motion.stagger = (STAGGERS as readonly string[]).includes(m.stagger) ? m.stagger : bad(`theme.motion.stagger must be one of: ${STAGGERS.join(", ")}.`);
  const mood = o.mood === undefined ? base.mood : MOODS.includes(o.mood) ? o.mood : bad(`theme.mood must be one of: ${MOODS.join(", ")}.`);
  if (o.tags !== undefined && !(Array.isArray(o.tags) && o.tags.every((x) => typeof x === "string"))) bad("theme.tags must be an array of strings.");
  return {
    id: o.id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : o.id,
    description: typeof o.description === "string" ? o.description : `Custom theme based on ${base.name}.`,
    mood,
    tags: o.tags ?? [],
    palette,
    fonts,
    motion,
    scripts: scriptsOf(fonts),
  };
}

/** A named theme id or a theme object -> a complete, validated theme. Throws BAD_THEME. */
export function resolveTheme(ref: ThemeRef): Theme {
  if (typeof ref === "string") {
    const id = ref.trim().toLowerCase().replace(/[\s_]+/g, "-");
    return byId.get(id) ?? bad(`Unknown theme "${ref}". Named themes: ${THEMES.map((x) => x.id).join(", ")} (or pass a theme object).`, { themes: THEMES.map((x) => x.id) });
  }
  // a named theme passed back as an object stays itself
  const named = byId.get((ref as { id?: string })?.id ?? "");
  if (named && JSON.stringify(named) === JSON.stringify(ref)) return named;
  return validateTheme(ref);
}

export const listThemes = (): Theme[] => THEMES.map((x) => ({ ...x }));

/** Which look control each token drives (documentation for describeTheme). */
export const TOKEN_MAP: Record<string, string> = {
  "palette.ink": "fill.color of light text over video; glow/outline colour when neutral and light",
  "palette.paper": "background.color of light plates/boxes",
  "palette.accent": "active.color / active.boxColor (key word, highlight, box); colourful glows; gradient start",
  "palette.accent2": "gradient end; colourful outlines; role colour of numbers and names",
  "palette.deep": "dark text on plates; dark outlines; dark plates",
  "palette.pop": "role colour of titles",
  "fonts.display": "fontId of heavy (700+) or all-caps looks",
  "fonts.text": "fontId of reading looks",
  "fonts.accent": "hero.fontId of looks that draw their key word in their own font",
  "motion.intensity": "motionIntensity (x the look's own)",
  "motion.entrySpeed": "entrance.durationMs and exit.durationMs (/ speed)",
  "motion.easing": "entrance.easing (smooth = outCubic, snappy = outExpo, gentle = outQuad, linear)",
  "motion.stagger": "entrance.stagger",
};

export function describeTheme(ref: ThemeRef): Theme & { tokens: Record<string, string> } {
  return { ...resolveTheme(ref), tokens: TOKEN_MAP };
}

// ---------------------------------------------------------------- tokens -> one look's controls

const EASE: Record<Exclude<ThemeEasing, "look">, string> = { smooth: "outCubic", snappy: "outExpo", gentle: "outQuad", linear: "linear" };
const round = (n: number, step: number) => Math.round(n / step) * step;

/** Single-weight sans/display faces are drawn heavy by design (Anton, Bebas Neue, Luckiest Guy ...). */
const heavyByDesign = (fontId: string) => {
  const e = getFontEntry(fontId);
  return !!e && (e.category === "sans" || e.category === "display") && e.weights.length === 1 && e.weights[0]! <= 400;
};
/** How heavy a face draws at a weight (single-weight heavy display faces count as 800). */
export const visualWeight = (fontId: string, weight: number) => (heavyByDesign(fontId) ? Math.max(800, weight) : weight);

/**
 * Whether a look face may become the theme face, and at which weight: never when the look's face is a heavy display
 * face by design, never when the theme face cannot reach (nearly) the same visual weight. `canSetWeight`: the look
 * honours fontWeight, so the nearest comparable weight is set; otherwise the look's own weight must already be one the
 * theme face draws at least as heavy.
 */
export function swapFace(fromFont: string, fromWeight: number, toFont: string, canSetWeight: boolean): { weight?: number } | null {
  if (fromFont === toFont) return {};
  if (heavyByDesign(fromFont)) return null;
  const target = visualWeight(fromFont, fromWeight);
  const weights = getFontEntry(toFont)?.weights ?? [];
  if (!weights.length) return null;
  const draws = (w: number) => visualWeight(toFont, w);
  if (canSetWeight) {
    const ok = weights.filter((w) => draws(w) >= target - 100 && w <= 900);
    if (!ok.length) return null;
    const best = [...ok].sort((a, b) => Math.abs(draws(a) - target) - Math.abs(draws(b) - target) || b - a)[0]!;
    return { weight: best };
  }
  return weights.includes(fromWeight) && draws(fromWeight) >= target - 100 ? {} : null;
}

/** The theme as flat style overrides for one look (only honoured, switched-on controls), plus what it changed. */
export function themeOverrides(look: LookDefinition, theme: Theme): { overrides: Record<string, unknown>; application: ThemeApplication } {
  const tpl = getTemplate(look.templateId);
  const style: CaptionStyleV2 = lookBase(look).style;
  const out: Record<string, unknown> = {};
  const skipped: string[] = [];
  const usable = (key: string) => {
    const def = controlByKey(key);
    if (!def) return false;
    const v = visibility(def, tpl, style);
    return v.visible && !v.needs;
  };
  const set = (key: string, value: unknown) => {
    if (usable(key)) out[key] = value;
  };
  const p = theme.palette;
  const used = new Set<string>();
  const use = (token: string) => used.add(token);

  // text fill: polarity kept; colourful gradients take accent -> accent2, material gradients stay
  const fill = style.fill;
  const fillLight = isLight(getKey(style, "fill.color") as string);
  if (fill.type === "solid") {
    set("fill.color", fillLight ? p.ink : p.deep);
    use(fillLight ? "palette.ink" : "palette.deep");
  } else if (fill.stops.some((s) => isColourful(s.color))) {
    set("fill.color", p.accent);
    set("fill.endColor", p.accent2);
    use("palette.accent");
    use("palette.accent2");
  }

  // plate: light -> paper, dark -> deep; then make the text on it readable
  const bgOn = style.background.type !== "none" && usable("background.color");
  let plate: string | undefined;
  if (bgOn) {
    plate = isLight(style.background.color) ? p.paper : p.deep;
    out["background.color"] = plate;
    use(isLight(style.background.color) ? "palette.paper" : "palette.deep");
    if (style.background.opacity >= 0.6 && "fill.color" in out && fill.type === "solid") out["fill.color"] = mostReadable(plate, [out["fill.color"] as string, p.ink, p.deep, p.paper]);
  }

  // highlight / key word: a look without a colour accent (highlight = text colour) keeps none
  const monoAccent = sameColour(style.active.color, getKey(style, "fill.color") as string);
  if (style.active.effect === "box") {
    set("active.boxColor", p.accent);
    set("active.color", mostReadable(p.accent, [p.deep, p.ink, p.paper]));
    use("palette.accent");
  } else if (monoAccent) {
    if ("fill.color" in out) set("active.color", out["fill.color"]);
  } else {
    set("active.color", plate && style.background.opacity >= 0.6 ? mostReadable(plate, [p.accent, p.accent2, p.pop, p.deep, p.ink]) : p.accent);
    use("palette.accent");
  }

  if (style.stroke.enabled && style.stroke.width > 0) {
    const c = style.stroke.color;
    set("stroke.color", isColourful(c) ? p.accent2 : isLight(c) ? p.ink : p.deep);
  }
  if (style.glow.enabled) set("glow.color", isColourful(style.glow.color) ? p.accent : p.ink);

  // fonts: heavy / caps looks take the display face, reading looks the text face; scripts and hand lettering take
  // the accent face; a separate key-word font becomes the accent face. A theme never makes a look lighter: a face is
  // only swapped when the theme font has a comparable weight (and that weight is set), and single-weight heavy display
  // faces (Anton, Bebas Neue ...) keep their own character.
  const cat = getFontEntry(style.fontId)?.category;
  const face = cat === "handwriting" ? theme.fonts.accent : style.fontWeight >= 700 || style.casing === "upper" ? theme.fonts.display : theme.fonts.text;
  const main = swapFace(style.fontId, style.fontWeight, face, usable("fontWeight"));
  if (main && usable("fontId")) {
    set("fontId", face);
    use(face === theme.fonts.accent ? "fonts.accent" : face === theme.fonts.display ? "fonts.display" : "fonts.text");
    if (main.weight !== undefined && main.weight !== style.fontWeight) out.fontWeight = main.weight;
  }
  if (style.hero.fontId && style.hero.fontId !== style.fontId) {
    // the key-word weight is not a control: swap only when the accent face draws it at least as heavy at that weight
    const heroWeight = style.hero.fontWeight ?? style.fontWeight;
    const hero = swapFace(style.hero.fontId, heroWeight, theme.fonts.accent, false);
    if (hero) {
      set("hero.fontId", theme.fonts.accent);
      if (usable("hero.fontId")) use("fonts.accent");
    }
  }

  // motion
  const m = theme.motion;
  const scaled = (key: string, value: number, step: number) => {
    const def = controlByKey(key);
    if (!def || !usable(key)) return;
    const r = rangeOf(def, getKey(style, key));
    const v = Math.min(r.max ?? Infinity, Math.max(r.min ?? -Infinity, round(value, step)));
    if (v !== getKey(style, key)) out[key] = Number(v.toFixed(4));
  };
  if (m.intensity !== 1) {
    scaled("motionIntensity", style.motionIntensity * m.intensity, 0.05);
    if (usable("motionIntensity")) use("motion.intensity");
  }
  if (m.entrySpeed !== 1) {
    scaled("entrance.durationMs", style.entrance.durationMs / m.entrySpeed, 10);
    if (style.exit.type !== "none") scaled("exit.durationMs", style.exit.durationMs / m.entrySpeed, 10);
    if (usable("entrance.durationMs")) use("motion.entrySpeed");
  }
  if (m.easing !== "look" && usable("entrance.easing")) {
    out["entrance.easing"] = EASE[m.easing];
    use("motion.easing");
  }
  if (m.stagger !== "look" && usable("entrance.stagger")) {
    out["entrance.stagger"] = m.stagger;
    use("motion.stagger");
  }

  // drop no-op entries so `applied` only lists real changes
  for (const [k, v] of Object.entries(out)) if (JSON.stringify(getKey(style, k)) === JSON.stringify(v) || (typeof v === "string" && sameColour(v, getKey(style, k) as string))) delete out[k];
  // accent2 and pop are also role colours (numbers, names, titles), so they are never "unused"
  for (const token of Object.keys(TOKEN_MAP)) if (!used.has(token) && token !== "palette.accent2" && token !== "palette.pop") skipped.push(token);
  return {
    overrides: out,
    application: { id: theme.id, name: theme.name, applied: Object.entries(out).map(([key, to]) => ({ key, from: getKey(style, key), to })), skipped },
  };
}
