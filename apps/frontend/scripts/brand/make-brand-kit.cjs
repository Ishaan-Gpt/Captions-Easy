// Generates the CaptionsEasy brand kit (SVG with outlined text, PNG, ICO): node apps/frontend/scripts/brand/make-brand-kit.cjs
// Fonts (SIL OFL): Plus Jakarta Sans ExtraBold + Instrument Serif Italic, the two site fonts.
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const REPO = path.join(__dirname, "..", "..", "..", "..");
const sharp = require(require.resolve("sharp", { paths: [path.join(REPO, "packages/compositions")] }));

const OUT = path.join(REPO, "apps/frontend/public/brand");
const APP = path.join(REPO, "apps/frontend/src/app");
fs.mkdirSync(OUT, { recursive: true });

const sans = opentype.loadSync(path.join(__dirname, "PlusJakartaSans-ExtraBold.ttf")); // Plus Jakarta Sans ExtraBold
const serif = opentype.loadSync(path.join(__dirname, "InstrumentSerif-Italic.ttf")); // Instrument Serif Italic

const C = { cream: "#FFFFEB", ink: "#1A1A1A", orange: "#FFA946", emerald: "#34D399", lav: "#F0D7FF" };
const TONES = {
  dark: { bar1: C.ink, word: C.ink, easy: C.ink }, // on light backgrounds
  light: { bar1: C.cream, word: C.cream, easy: C.lav }, // on dark backgrounds
};

// Three caption bars (3:5:4), bottom-aligned: the mark. Unit box 60 x 80.
const bars = (x, baseline, h, first) => {
  const w = h * 0.175, gap = h * 0.1125;
  const hs = [0.6, 1, 0.8].map((k) => k * h);
  const cols = [first, C.orange, C.emerald];
  return hs.map((bh, i) => `<rect x="${(x + i * (w + gap)).toFixed(2)}" y="${(baseline - bh).toFixed(2)}" width="${w.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(w / 2).toFixed(2)}" fill="${cols[i]}"/>`).join("");
};
const barsWidth = (h) => h * 0.175 * 3 + h * 0.1125 * 2;

function word(size, tone) {
  const t = TONES[tone];
  const a = sans.getPath("Captions", 0, 0, size);
  const aw = sans.getAdvanceWidth("Captions", size);
  const es = size * 1.14; // Instrument Serif runs small next to a heavy sans
  const b = serif.getPath("Easy", aw + size * 0.04, 0, es);
  const bw = serif.getAdvanceWidth("Easy", es);
  const bbA = a.getBoundingBox(), bbB = b.getBoundingBox();
  return {
    d: `<path d="${a.toPathData(2)}" fill="${t.word}"/><path d="${b.toPathData(2)}" fill="${t.easy}"/>`,
    width: aw + size * 0.04 + bw,
    top: Math.min(bbA.y1, bbB.y1),
    bottom: Math.max(bbA.y2, bbB.y2),
  };
}

function svgDoc(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

function wordmark(tone) {
  const size = 100, pad = 6;
  const wd = word(size, tone);
  const h = wd.bottom - wd.top + pad * 2;
  return svgDoc(wd.width + pad * 2, h, `<g transform="translate(${pad},${(-wd.top + pad).toFixed(2)})">${wd.d}</g>`, "CaptionsEasy");
}

function lockup(tone) {
  const size = 100, pad = 6;
  const wd = word(size, tone);
  const cap = sans.charToGlyph("C").getBoundingBox().y2 / sans.unitsPerEm * size; // cap height
  const bh = cap * 1.18;
  const bw = barsWidth(bh);
  const gap = size * 0.2;
  const top = Math.min(wd.top, -bh);
  const h = wd.bottom - top + pad * 2;
  const y0 = -top + pad;
  const body = `<g transform="translate(${pad},${y0.toFixed(2)})">${bars(0, 0, bh, TONES[tone].bar1)}<g transform="translate(${(bw + gap).toFixed(2)},0)">${wd.d}</g></g>`;
  return svgDoc(pad * 2 + bw + gap + wd.width, h, body, "CaptionsEasy");
}

function icon(tone, withTile) {
  // 100x100: bars centred; favicon version sits on a cream (or ink) rounded tile so it reads on any tab colour
  const s = 100, bh = withTile ? 58 : 80;
  const bw = barsWidth(bh);
  const tile = withTile ? `<rect width="100" height="100" rx="22" fill="${tone === "dark" ? C.cream : C.ink}"/>` : "";
  return svgDoc(s, s, tile + bars((s - bw) / 2, (s + bh) / 2, bh, TONES[tone].bar1), "CaptionsEasy");
}

const files = {
  "captionseasy-logo.svg": lockup("dark"),
  "captionseasy-logo-light.svg": lockup("light"),
  "captionseasy-wordmark.svg": wordmark("dark"),
  "captionseasy-wordmark-light.svg": wordmark("light"),
  "captionseasy-icon.svg": icon("dark", false),
  "captionseasy-icon-light.svg": icon("light", false),
  "captionseasy-app-icon.svg": icon("dark", true),
};
for (const [n, svg] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), svg);

// ICO with embedded PNG images (16/32/48)
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dirs = pngs.map(({ size, buf }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size >= 256 ? 0 : size, 0); d.writeUInt8(size >= 256 ? 0 : size, 1);
    d.writeUInt8(0, 2); d.writeUInt8(0, 3); d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8); d.writeUInt32LE(offset, 12);
    offset += buf.length;
    return d;
  });
  return Buffer.concat([header, ...dirs, ...pngs.map((p) => p.buf)]);
}

(async () => {
  const app = Buffer.from(files["captionseasy-app-icon.svg"]);
  const png = (svg, w) => sharp(Buffer.from(svg), { density: 600 }).resize(w).png().toBuffer();
  await sharp(await png(app, 512)).toFile(path.join(OUT, "captionseasy-icon-512.png"));
  await sharp(await png(app, 192)).toFile(path.join(OUT, "captionseasy-icon-192.png"));
  await sharp(await png(files["captionseasy-logo.svg"], 1200)).toFile(path.join(OUT, "captionseasy-logo.png"));
  await sharp(await png(files["captionseasy-logo-light.svg"], 1200)).toFile(path.join(OUT, "captionseasy-logo-light.png"));
  await sharp(await png(files["captionseasy-wordmark.svg"], 1200)).toFile(path.join(OUT, "captionseasy-wordmark.png"));
  // Next.js file-based icons: favicon.ico, icon.svg, apple-icon.png
  const icoBuf = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(app, size) }))));
  fs.writeFileSync(path.join(APP, "favicon.ico"), icoBuf);
  fs.writeFileSync(path.join(APP, "icon.svg"), files["captionseasy-app-icon.svg"]);
  // apple touch icon: no transparency, full-bleed cream
  const apple = svgDoc(180, 180, `<rect width="180" height="180" fill="${C.cream}"/>` + bars((180 - barsWidth(104)) / 2, (180 + 104) / 2, 104, C.ink), "CaptionsEasy");
  await sharp(await png(apple, 180)).toFile(path.join(APP, "apple-icon.png"));
  console.log("brand kit written:", fs.readdirSync(OUT).join(", "));
})();
