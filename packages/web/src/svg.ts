/**
 * The "native" canvas engine: the live caption DOM (the same mount the DOM renderer uses) serialised into an SVG
 * <foreignObject> and decoded as an image, so Chrome's own painter draws it, exactly like the server renderer's
 * screenshot. The two classic problems of this technique are handled:
 *  - fonts: an SVG image cannot see the page's fonts, so every web font the captions use is embedded as a data: URL
 *    @font-face (sources are recorded when the fonts are created, files fetched once and cached);
 *  - <canvas> elements (two looks draw into one) are not serialised by the browser, so they are replaced by <img>
 *    snapshots.
 * Same-origin data only, so the target canvas is never tainted in Chromium and Firefox (Safari: see README).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------------ font sources

type FaceInfo = { family: string; source: string; weight: string; style: string; unicodeRange: string; stretch: string };
const faceInfo = new WeakMap<FontFace, FaceInfo>();
let installed = false;

/**
 * Wrap the FontFace constructor so every face created from a URL remembers it (FontFace has no `src` getter).
 * Called before any caption font loads (ready()/mount); faces made earlier are simply not embedded.
 */
export function recordFontFaces(): void {
  if (installed || typeof window === "undefined" || typeof window.FontFace !== "function") return;
  installed = true;
  const Native = window.FontFace;
  class RecordingFontFace extends Native {
    constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
      super(family, source, descriptors);
      if (typeof source === "string") {
        faceInfo.set(this, { family, source, weight: descriptors?.weight ?? "normal", style: descriptors?.style ?? "normal", unicodeRange: descriptors?.unicodeRange ?? "", stretch: descriptors?.stretch ?? "" });
      }
    }
  }
  (window as unknown as { FontFace: typeof FontFace }).FontFace = RecordingFontFace as unknown as typeof FontFace;
}

const dataUrls = new Map<string, Promise<string | null>>();

const toDataUrl = (url: string): Promise<string | null> => {
  let p = dataUrls.get(url);
  if (!p) {
    p = fetch(url, { mode: "cors" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (b) =>
          new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(b);
          }),
      )
      .catch(() => null);
    dataUrls.set(url, p);
  }
  return p;
};

const urlOf = (source: string) => /url\((['"]?)([^'")]+)\1\)/.exec(source)?.[2] ?? null;
const cssString = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

const faceCssCache = new Map<string, Promise<string>>();

/** @font-face rules (data: URLs) for the loaded faces whose family appears in `markup`. */
async function fontCss(markup: string): Promise<string> {
  const faces: FaceInfo[] = [];
  document.fonts.forEach((f) => {
    const info = faceInfo.get(f);
    if (info && f.status === "loaded" && markup.includes(info.family)) faces.push(info);
  });
  const rules = await Promise.all(
    faces.map((f) => {
      const k = `${f.family}|${f.source}|${f.weight}|${f.style}|${f.unicodeRange}`;
      let p = faceCssCache.get(k);
      if (!p) {
        p = (async () => {
          const url = urlOf(f.source);
          const data = url ? (url.startsWith("data:") ? url : await toDataUrl(new URL(url, location.href).href)) : null;
          if (!data) return "";
          return `@font-face{font-family:${cssString(f.family)};src:url(${data});font-weight:${f.weight};font-style:${f.style};${f.stretch ? `font-stretch:${f.stretch};` : ""}${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ""}font-display:block}`;
        })();
        faceCssCache.set(k, p);
      }
      return p;
    }),
  );
  return rules.join("");
}

// ------------------------------------------------------------------ serialise + rasterise

/** XHTML of the caption root; <canvas> children become <img> snapshots. */
function serialise(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.style.transform = "";
  const live = root.querySelectorAll("canvas");
  if (live.length) {
    const copies = clone.querySelectorAll("canvas");
    live.forEach((c, i) => {
      const img = document.createElement("img");
      try {
        img.src = c.toDataURL("image/png");
      } catch {
        /* tainted: leave empty */
      }
      img.setAttribute("style", c.getAttribute("style") ?? "");
      img.width = c.width;
      img.height = c.height;
      copies[i]?.replaceWith(img);
    });
  }
  return new XMLSerializer().serializeToString(clone);
}

export interface RasteriseOptions {
  width: number;
  height: number;
  scale: number;
  /** CSS that the live mount gets from stylesheets (Remotion's base CSS for the root's class) */
  baseCss: string;
}

/** The caption root -> an image (decoded, ready to drawImage) at width*scale x height*scale. */
export async function rasterise(root: HTMLElement, o: RasteriseOptions): Promise<HTMLImageElement> {
  const markup = serialise(root);
  const fonts = await fontCss(markup);
  const w = Math.round(o.width * o.scale);
  const h = Math.round(o.height * o.scale);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${o.width} ${o.height}">` +
    `<foreignObject x="0" y="0" width="${o.width}" height="${o.height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${o.width}px;height:${o.height}px;overflow:hidden;margin:0">` +
    `<style>${escapeXml(fonts + o.baseCss)}</style>${markup}</div></foreignObject></svg>`;
  // a data: URL, not a blob: URL: Chromium taints canvases that draw a blob: SVG holding a <foreignObject>
  const img = new Image(w, h);
  img.decoding = "sync";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
