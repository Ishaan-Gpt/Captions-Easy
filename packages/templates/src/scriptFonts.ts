/**
 * Script support + per-script fallback fonts.
 *
 * Every look font draws Latin. For Devanagari, a look font either has the glyphs itself (NATIVE) or gets a partner
 * Devanagari font of similar weight/feel (all OFL, loaded through @remotion/google-fonts like every other look font).
 *
 * How the fallback renders WITHOUT touching Latin output: the partner is registered under its own alias family
 * ("ce-deva <Partner>") whose @font-face unicode-range covers ONLY the Devanagari blocks. The alias is appended to the
 * look's CSS font stack only after it has been loaded for a caption track that contains Devanagari (see
 * scriptFallbackFamilies + useFontsReady). Latin-only tracks never load it, so their font stack string, measurements
 * and pixels are byte-for-byte unchanged; and even when active, the unicode-range means Latin glyphs can never be drawn
 * by the alias.
 */
import type { FontCategory } from "./fontCatalog";

export type FontScript = "latin" | "devanagari";

/** Devanagari fallback families (OFL), in preference order of the feel table below */
export const DEVANAGARI_FONTS = ["Baloo 2", "Mukta", "Hind", "Noto Sans Devanagari", "Tiro Devanagari Hindi"] as const;
export type DevanagariFont = (typeof DEVANAGARI_FONTS)[number];

/** look fonts whose Google family ships a devanagari subset (checked against getInfo() in scriptFonts.test.ts) */
export const NATIVE_DEVANAGARI = new Set<string>(["Baloo 2", "Mukta", "Poppins"]);

/** look font -> Devanagari partner of similar weight and feel */
const FEEL: Record<string, DevanagariFont> = {
  // heavy condensed / impact display: Mukta's 800 is compact and punchy
  Anton: "Mukta", "Bebas Neue": "Mukta", Oswald: "Mukta", "Big Shoulders": "Mukta", "Roboto Condensed": "Mukta",
  "Barlow Semi Condensed": "Mukta", "Archivo Black": "Mukta", "Russo One": "Mukta", "Rubik Mono One": "Mukta", Unbounded: "Mukta",
  Kanit: "Mukta",
  // rounded, playful, comic, marker, handwritten-bold: Baloo 2
  Bangers: "Baloo 2", "Luckiest Guy": "Baloo 2", "Lilita One": "Baloo 2", Chewy: "Baloo 2", Fredoka: "Baloo 2", "Comic Neue": "Baloo 2",
  Galindo: "Baloo 2", Righteous: "Baloo 2", "Passion One": "Baloo 2", "Passero One": "Baloo 2", "Fontdiner Swanky": "Baloo 2",
  "Rubik Microbe": "Baloo 2", "Permanent Marker": "Baloo 2", "Kaushan Script": "Baloo 2", Pacifico: "Baloo 2", Caveat: "Baloo 2",
  "Alfa Slab One": "Baloo 2", "Tilt Neon": "Baloo 2", Nunito: "Baloo 2",
  // serif / editorial / elegant script: Tiro Devanagari Hindi
  "Playfair Display": "Tiro Devanagari Hindi", "DM Serif Display": "Tiro Devanagari Hindi", Fraunces: "Tiro Devanagari Hindi",
  "Cormorant Garamond": "Tiro Devanagari Hindi", "Instrument Serif": "Tiro Devanagari Hindi", "Libre Baskerville": "Tiro Devanagari Hindi",
  Merriweather: "Tiro Devanagari Hindi", "Bodoni Moda": "Tiro Devanagari Hindi", Cinzel: "Tiro Devanagari Hindi",
  "Alex Brush": "Tiro Devanagari Hindi", Allura: "Tiro Devanagari Hindi", "Dancing Script": "Tiro Devanagari Hindi",
  "Great Vibes": "Tiro Devanagari Hindi", Satisfy: "Tiro Devanagari Hindi",
  // humanist text sans: Hind
  Lato: "Hind", Roboto: "Hind", Arimo: "Hind", Lexend: "Hind", "Instrument Sans": "Hind",
  // geometric / grotesk sans and mono: Noto Sans Devanagari (full 100-900 range)
  Montserrat: "Noto Sans Devanagari", Inter: "Noto Sans Devanagari", "Inter Tight": "Noto Sans Devanagari", "DM Sans": "Noto Sans Devanagari",
  Manrope: "Noto Sans Devanagari", "Plus Jakarta Sans": "Noto Sans Devanagari", Outfit: "Noto Sans Devanagari", Sora: "Noto Sans Devanagari",
  Jost: "Noto Sans Devanagari", "Josefin Sans": "Noto Sans Devanagari", "Space Grotesk": "Noto Sans Devanagari",
  "IBM Plex Mono": "Noto Sans Devanagari", "JetBrains Mono": "Noto Sans Devanagari", "Space Mono": "Noto Sans Devanagari", VT323: "Noto Sans Devanagari",
};

const BY_CATEGORY: Record<FontCategory, DevanagariFont> = { serif: "Tiro Devanagari Hindi", handwriting: "Baloo 2", display: "Baloo 2", sans: "Noto Sans Devanagari", mono: "Noto Sans Devanagari" };

/** The family that draws Devanagari for a look font: itself when native, else its partner. */
export function devanagariPartner(fontId: string, category?: FontCategory): string {
  if (NATIVE_DEVANAGARI.has(fontId)) return fontId;
  return FEEL[fontId] ?? BY_CATEGORY[category ?? "sans"];
}

/** Scripts a font draws by itself. */
export function fontScripts(fontId: string): FontScript[] {
  return NATIVE_DEVANAGARI.has(fontId) ? ["latin", "devanagari"] : ["latin"];
}

/** CSS alias family a partner is registered under (Devanagari unicode-range only). */
export const devanagariAlias = (partner: string) => `ce-deva ${partner}`;

/** unicode-range of the alias faces: the Devanagari blocks only (no shared punctuation, no ZWJ, no currency) */
export const DEVANAGARI_UNICODE_RANGE = "U+0900-097F, U+1CD0-1CF9, U+A8E0-A8FF";

const PSEUDO = "ce-script:devanagari:";
/** pseudo family name understood by loadFontFamily/useFontsReady: loads + activates a partner's alias */
export const scriptFallbackKey = (partner: string) => `${PSEUDO}${partner}`;
export const parseScriptFallbackKey = (family: string): string | null => (family.startsWith(PSEUDO) ? family.slice(PSEUDO.length) : null);

// ---- activation registry (module state: an alias joins font stacks only once it has really loaded) ----
const active = new Set<string>();
export function activateDevanagariFallback(partner: string): void {
  active.add(partner);
}
export const isDevanagariFallbackActive = (partner: string) => active.has(partner);
/** for tests */
export function resetScriptFallbacks(): void {
  active.clear();
}

/** ", 'ce-deva Partner'" when that partner is active for this font, else "" (Latin-only stacks stay identical). */
export function scriptFallbackCss(fontId: string, category?: FontCategory): string {
  if (!active.size) return "";
  const p = devanagariPartner(fontId, category);
  return active.has(p) ? `, '${devanagariAlias(p)}'` : "";
}

const DEVA = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;

/**
 * Extra families to pass to useFontsReady for a caption track: one pseudo family per Devanagari partner needed by the
 * given look fonts, and none at all when no word contains Devanagari.
 */
export function scriptFallbackFamilies(words: { text: string }[], fontIds: (string | null | undefined)[], categoryOf?: (fontId: string) => FontCategory | undefined): string[] {
  if (!words.some((w) => DEVA.test(w.text))) return [];
  const out = new Set<string>();
  for (const f of fontIds) if (f) out.add(scriptFallbackKey(devanagariPartner(f, categoryOf?.(f))));
  return [...out];
}

/**
 * Script support of a look, from its fonts and its template: "native" scripts its fonts draw themselves, "fallback"
 * scripts drawn by a partner font, "unsupported" scripts the template cannot shape (it splits words into letters,
 * which breaks Devanagari conjuncts and matras: romanize instead).
 */
export interface ScriptSupport {
  native: FontScript[];
  fallback: Partial<Record<FontScript, string>>;
  unsupported: FontScript[];
}
export function scriptSupport(fontIds: string[], templateScripts?: readonly FontScript[], categoryOf?: (fontId: string) => FontCategory | undefined): ScriptSupport {
  const fonts = fontIds.filter(Boolean);
  const allNative = fonts.length > 0 && fonts.every((f) => NATIVE_DEVANAGARI.has(f));
  const templateOk = !templateScripts || templateScripts.includes("devanagari");
  if (!templateOk) return { native: ["latin"], fallback: {}, unsupported: ["devanagari"] };
  if (allNative) return { native: ["latin", "devanagari"], fallback: {}, unsupported: [] };
  return { native: ["latin"], fallback: { devanagari: devanagariPartner(fonts[0] ?? "", categoryOf?.(fonts[0] ?? "")) }, unsupported: [] };
}
