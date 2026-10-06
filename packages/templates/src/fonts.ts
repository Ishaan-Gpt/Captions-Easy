import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { fontStack, getFontEntry } from "./fontCatalog";

type GoogleFontModule = {
  loadFont: (style?: string, options?: { weights?: string[]; subsets?: string[]; ignoreTooManyRequestsWarning?: boolean }) => {
    fontFamily: string;
    waitUntilDone: () => Promise<void>;
  };
};

/**
 * Explicit lazy loaders (bundlers need static import paths). Keyed by the family name used in styles.
 * Add new families here; anything missing falls back to the system stack without failing the render.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  Anton: () => import("@remotion/google-fonts/Anton"),
  "Archivo Black": () => import("@remotion/google-fonts/ArchivoBlack"),
  "Baloo 2": () => import("@remotion/google-fonts/Baloo2"),
  Bangers: () => import("@remotion/google-fonts/Bangers"),
  "Bebas Neue": () => import("@remotion/google-fonts/BebasNeue"),
  "Bodoni Moda": () => import("@remotion/google-fonts/BodoniModa"),
  Caveat: () => import("@remotion/google-fonts/Caveat"),
  Cinzel: () => import("@remotion/google-fonts/Cinzel"),
  "Comic Neue": () => import("@remotion/google-fonts/ComicNeue"),
  "Cormorant Garamond": () => import("@remotion/google-fonts/CormorantGaramond"),
  "DM Sans": () => import("@remotion/google-fonts/DMSans"),
  Fredoka: () => import("@remotion/google-fonts/Fredoka"),
  Inter: () => import("@remotion/google-fonts/Inter"),
  "Instrument Serif": () => import("@remotion/google-fonts/InstrumentSerif"),
  "JetBrains Mono": () => import("@remotion/google-fonts/JetBrainsMono"),
  "Kaushan Script": () => import("@remotion/google-fonts/KaushanScript"),
  Lexend: () => import("@remotion/google-fonts/Lexend"),
  "Libre Baskerville": () => import("@remotion/google-fonts/LibreBaskerville"),
  "Lilita One": () => import("@remotion/google-fonts/LilitaOne"),
  "Luckiest Guy": () => import("@remotion/google-fonts/LuckiestGuy"),
  Manrope: () => import("@remotion/google-fonts/Manrope"),
  Montserrat: () => import("@remotion/google-fonts/Montserrat"),
  Mukta: () => import("@remotion/google-fonts/Mukta"),
  "Noto Color Emoji": () => import("@remotion/google-fonts/NotoColorEmoji"),
  Nunito: () => import("@remotion/google-fonts/Nunito"),
  Outfit: () => import("@remotion/google-fonts/Outfit"),
  Pacifico: () => import("@remotion/google-fonts/Pacifico"),
  "Permanent Marker": () => import("@remotion/google-fonts/PermanentMarker"),
  "Playfair Display": () => import("@remotion/google-fonts/PlayfairDisplay"),
  Poppins: () => import("@remotion/google-fonts/Poppins"),
  Righteous: () => import("@remotion/google-fonts/Righteous"),
  "Roboto Condensed": () => import("@remotion/google-fonts/RobotoCondensed"),
  "Rubik Mono One": () => import("@remotion/google-fonts/RubikMonoOne"),
  "Russo One": () => import("@remotion/google-fonts/RussoOne"),
  Sora: () => import("@remotion/google-fonts/Sora"),
  "Space Mono": () => import("@remotion/google-fonts/SpaceMono"),
  "Tilt Neon": () => import("@remotion/google-fonts/TiltNeon"),
  VT323: () => import("@remotion/google-fonts/VT323"),
};

/** families whose looks set words in true italics (not the browser's slanted fake) */
const ITALIC_FAMILIES = new Set(["Instrument Serif", "Playfair Display", "Cormorant Garamond", "Bodoni Moda"]);

export const KNOWN_FONTS = Object.keys(LOADERS).filter((f) => f !== "Noto Color Emoji");
export const EMOJI_FONT = "Noto Color Emoji";

const started = new Map<string, Promise<void>>();

const WANT = [400, 500, 600, 700, 800, 900];

/** Weights to fetch: the caption range the family offers, else whatever it has (display faces are often 400 only). */
function pickWeights(available: number[]): number[] {
  const hit = available.filter((w) => WANT.includes(w));
  return hit.length ? hit : available.slice(0, 3);
}

const hasDom = () => typeof document !== "undefined" && "fonts" in document && typeof FontFace !== "undefined";

/**
 * Google family from the CSS API (the browser gets woff2 for its own engine). Latin faces load now; other scripts
 * are registered and fetched by the browser only when a caption actually uses them.
 */
async function loadGoogleCss(family: string, weights: number[], alias = family, text?: string): Promise<void> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}${text ? "" : `:wght@${weights.join(";")}`}&display=block${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font css ${family}: ${res.status}`);
  const css = await res.text();
  const latin: Promise<FontFace>[] = [];
  for (const m of css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*{([^}]*)}/g)) {
    const subset = m[1] ?? "latin";
    const body = m[2]!;
    const src = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
    if (!src) continue;
    const weight = /font-weight:\s*([\d ]+);/.exec(body)?.[1]?.trim() ?? "400";
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    const face = new FontFace(alias, `url(${src})`, { weight, style: "normal", ...(range ? { unicodeRange: range } : {}) });
    document.fonts.add(face);
    if (subset === "latin" || subset === "latin-ext" || text) latin.push(face.load());
  }
  await Promise.all(latin);
}

async function loadHosted(family: string, id: string, weights: number[]): Promise<void> {
  await Promise.all(
    weights.map(async (w) => {
      const face = new FontFace(family, `url(https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${w}-normal.woff2)`, { weight: String(w), style: "normal" });
      document.fonts.add(face);
      await face.load();
    }),
  );
}

export function loadFontFamily(family: string): Promise<void> {
  const existing = started.get(family);
  if (existing) return existing;
  const loader = LOADERS[family];
  const entry = getFontEntry(family);
  const p = (async () => {
    if (loader) {
      const mod = (await loader()) as GoogleFontModule;
      let loaded: ReturnType<GoogleFontModule["loadFont"]>;
      try {
        loaded = mod.loadFont("normal", { weights: ["400", "600", "700", "800", "900"], subsets: ["latin"], ignoreTooManyRequestsWarning: true });
      } catch {
        // requested weights not offered by this family: load its defaults
        loaded = mod.loadFont(undefined, { subsets: ["latin"], ignoreTooManyRequestsWarning: true });
      }
      await loaded.waitUntilDone();
      if (ITALIC_FAMILIES.has(family)) {
        try {
          await mod.loadFont("italic", { weights: ["400", "600", "700", "800", "900"], subsets: ["latin"], ignoreTooManyRequestsWarning: true }).waitUntilDone();
        } catch {
          await mod.loadFont("italic", { subsets: ["latin"], ignoreTooManyRequestsWarning: true }).waitUntilDone();
        }
      }
      return;
    }
    if (!entry || !hasDom()) return; // a font from this device (or unknown): the system draws it or falls back
    if (entry.source === "device") return loadFontFamily(entry.fallback!);
    if (entry.source === "hosted") return loadHosted(family, entry.fontsourceId!, pickWeights(entry.weights));
    return loadGoogleCss(family, pickWeights(entry.weights));
  })().catch(() => {
    started.delete(family); // allow a retry on the next mount
  });
  started.set(family, p);
  return p;
}

const previews = new Map<string, Promise<string>>();

/**
 * CSS family that draws `family`'s own name in the font picker without downloading the whole font: Google gives
 * a few-KB subset holding only those letters. Device fonts preview as themselves when installed, else as their
 * fallback; hosted fonts are small, so they load fully.
 */
export function loadFontPreview(family: string): Promise<string> {
  const hit = previews.get(family);
  if (hit) return hit;
  const entry = getFontEntry(family);
  const p = (async () => {
    if (!hasDom()) return fontStack(family);
    if (started.has(family) || !entry || entry.source === "hosted") {
      await loadFontFamily(family);
      return fontStack(family);
    }
    if (entry.source === "device") {
      if (deviceHasFont(family)) return fontStack(family);
      await loadFontFamily(entry.fallback!); // what will really show, so preview it whole
      return fontStack(family);
    }
    const alias = `ce-preview ${family}`;
    await loadGoogleCss(family, [], alias, [...new Set(family)].join(""));
    return `'${alias}', system-ui, sans-serif`;
  })().catch(() => fontStack(family));
  previews.set(family, p);
  return p;
}

const deviceCache = new Map<string, boolean>();

/** Whether a device font (any of its local names) is installed, by comparing glyph widths with generic fallbacks. */
export function deviceHasFont(family: string): boolean {
  const entry = getFontEntry(family);
  const names = entry?.source === "device" ? entry.local! : [family];
  const key = names.join("|");
  const cached = deviceCache.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return false;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return false;
  const sample = "mmmmmmmmmmlli WQ@#0123 AaBbGgRr";
  const width = (font: string) => {
    ctx.font = font;
    return ctx.measureText(sample).width;
  };
  // Windows quietly maps Helvetica/Times/Courier to Arial/Times New Roman/Courier New: that isn't the real font
  const SUBSTITUTES = ["Arial", "Times New Roman", "Courier New"];
  const found = names.some(
    (n) =>
      ["monospace", "serif", "sans-serif"].some((g) => width(`72px '${n}', ${g}`) !== width(`72px ${g}`)) &&
      (SUBSTITUTES.includes(n) || SUBSTITUTES.every((sub) => width(`72px '${n}', monospace`) !== width(`72px '${sub}', monospace`))),
  );
  deviceCache.set(key, found);
  return found;
}

/**
 * Blocks rendering until every family is loaded. Call ONCE near the composition root so frames are
 * never captured with fallback glyphs, and measurement runs on real metrics.
 */
export function useFontsReady(families: string[]): boolean {
  const key = [...new Set(families.filter(Boolean))].sort().join("|");
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading caption fonts", { timeoutInMilliseconds: 60000 }));

  useEffect(() => {
    let alive = true;
    Promise.all(key.split("|").filter(Boolean).map(loadFontFamily))
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => cancelRender(e));
    return () => {
      alive = false;
    };
  }, [key]);

  // release the frame only AFTER React has committed the caption pages that depend on `ready`. Continuing in the
  // same tick as setReady let renderers (notably the in-browser one) capture early frames with no captions.
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);

  return ready;
}
