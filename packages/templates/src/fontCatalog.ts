import generated from "./fontCatalog.generated.json";

export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono";

/**
 * - google: loaded from Google Fonts when picked.
 * - hosted: an open-licence family that isn't on Google Fonts, served by the Fontsource CDN.
 * - device: a commercial / system font we may not redistribute. It is used when installed on this device;
 *   otherwise the open `fallback` (always loaded) shows instead, so captions never break.
 */
export type FontSource = "google" | "hosted" | "device";

export interface FontEntry {
  family: string;
  category: FontCategory;
  weights: number[];
  source: FontSource;
  /** device fonts: local family names tried in order */
  local?: string[];
  /** device fonts: open family drawn when none of `local` is installed */
  fallback?: string;
  /** hosted fonts: Fontsource id */
  fontsourceId?: string;
}

const W = (s: string) => s.split(",").map(Number);
const device = (family: string, category: FontCategory, local: string[], fallback: string): FontEntry => ({ family, category, weights: [400, 700, 900], source: "device", local, fallback });
const hosted = (family: string, category: FontCategory, fontsourceId: string, weights: number[]): FontEntry => ({ family, category, weights, source: "hosted", fontsourceId });

/**
 * Licensed fonts that only draw when installed on the viewer's device. Not offered in the picker any more
 * (zero setup for creators); kept so older projects that picked one still render with the open fallback.
 */
const DEVICE_FONTS: FontEntry[] = [
  device("Helvetica", "sans", ["Helvetica Neue", "Helvetica"], "Arimo"),
  device("Coolvetica", "display", ["Coolvetica", "Coolvetica Rg", "Coolvetica Hv"], "Inter Tight"),
  device("Birds of Paradise", "handwriting", ["Birds of Paradise", "Birds of Paradise Personal use", "Birds of Paradise PERSONAL USE ONLY"], "Great Vibes"),
  device("Futura", "sans", ["Futura", "Futura PT", "Futura Std"], "Jost"),
  device("Avenir", "sans", ["Avenir Next", "Avenir"], "Nunito Sans"),
  device("SF Pro", "sans", ["SF Pro Display", "SF Pro Text", "SF Pro"], "Inter"),
  device("Gilroy", "sans", ["Gilroy", "Gilroy-Bold"], "Plus Jakarta Sans"),
  device("Proxima Nova", "sans", ["Proxima Nova"], "Montserrat"),
  device("The Bold Font", "display", ["The Bold Font", "THE BOLD FONT"], "Anton"),
  device("Komika Axis", "display", ["Komika Axis"], "Bangers"),
  device("Impact", "display", ["Impact"], "Anton"),
  device("Arial", "sans", ["Arial"], "Arimo"),
  device("Georgia", "serif", ["Georgia"], "Gelasio"),
  device("Times New Roman", "serif", ["Times New Roman", "Times"], "Tinos"),
  device("Courier New", "mono", ["Courier New", "Courier"], "Cousine"),
];

// Remotion-bundled families the looks use; some are missing from the generated popularity cut
const EXTRA_GOOGLE: [string, FontCategory, string][] = [
  ["Bangers", "display", "400"],
  ["Kaushan Script", "handwriting", "400"],
  ["Roboto Condensed", "sans", "100,200,300,400,500,600,700,800,900"],
  ["Tilt Neon", "display", "400"],
];

const google: FontEntry[] = [...(generated as [string, FontCategory, string][]), ...EXTRA_GOOGLE].map(([family, category, weights]) => ({ family, category, weights: W(weights), source: "google" }));

const HOSTED_FONTS: FontEntry[] = [
  hosted("Open Sauce One", "sans", "open-sauce-one", W("300,400,500,600,700,800,900")),
  hosted("Open Sauce Sans", "sans", "open-sauce-sans", W("300,400,500,600,700,800,900")),
];

const byFamily = new Map<string, FontEntry>();
for (const f of [...google, ...DEVICE_FONTS, ...HOSTED_FONTS]) byFamily.set(f.family, f);

/** Creator favourites, shown first. Every one loads by itself the moment it's picked: nothing to install. */
const POPULAR_GOOGLE = ["Montserrat", "Poppins", "Inter", "Anton", "Bebas Neue", "Bangers", "Luckiest Guy", "Archivo Black", "Oswald", "Plus Jakarta Sans", "Playfair Display", "Pacifico"];
export const POPULAR_FONTS: FontEntry[] = [
  ...HOSTED_FONTS,
  ...POPULAR_GOOGLE.map((f) => byFamily.get(f)).filter((f): f is FontEntry => f?.source === "google"),
];

export const GOOGLE_FONTS: FontEntry[] = [...new Map(google.map((f) => [f.family, f])).values()];

export const FONT_CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Handwriting" },
  { id: "mono", label: "Mono" },
];

export function getFontEntry(family: string): FontEntry | undefined {
  return byFamily.get(family);
}

const q = (f: string) => `'${f.replace(/'/g, "")}'`;

/** CSS font-family for a style's fontId. Device fonts list their local names, then the loaded open fallback. */
export function fontStack(fontId: string): string {
  const e = byFamily.get(fontId);
  if (e?.source === "device") return [...e.local!, e.fallback!].map(q).join(", ") + ", system-ui, sans-serif";
  return `${q(fontId)}, system-ui, sans-serif`;
}
