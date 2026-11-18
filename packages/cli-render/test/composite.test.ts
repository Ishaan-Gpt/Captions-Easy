/** The fast burn's pieces: which looks may take it, the PNG decoder and the blend. */
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildCaptions } from "../../cli/src/captions";
import { blendOver, canComposite, decodePng, decodePngAsync } from "../src/composite";
import { failureHint } from "../src/render";

const words = [
  { text: "hello", startMs: 0, endMs: 400 },
  { text: "there", startMs: 400, endMs: 900 },
];
const styleOf = (look: number) => buildCaptions({ words, look }).style;

describe("canComposite", () => {
  it("takes looks that draw on top of the picture", () => {
    for (const n of [1, 12, 129, 130, 131, 133]) expect(canComposite(styleOf(n)), `#${n}`).toBe(true);
  });
  it("keeps the full render for looks made from the video (#87, #118, #132)", () => {
    for (const n of [87, 118, 132]) expect(canComposite(styleOf(n)), `#${n}`).toBe(false);
  });
  it("keeps the full render for a backdrop blur", () => {
    const st = styleOf(12);
    const withBg = (blur: number) => ({ ...st, background: { ...(st.background as object), type: "pill", blur } });
    expect(canComposite(withBg(8))).toBe(false);
    expect(canComposite(withBg(0))).toBe(true);
  });
});

// ---------------------------------------------------------------- a tiny PNG encoder, every row filter type

const crc = (b: Buffer) => {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const t = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  out.writeUInt32BE(crc(t), 8 + data.length);
  return out;
};
const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
function encodePng(w: number, h: number, ch: 3 | 4, px: Uint8Array): Buffer {
  const stride = w * ch;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const f = y % 5; // every filter type, in turn
    raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x]!;
      const a = x >= ch ? px[y * stride + x - ch]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch]! : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]!;
      raw[y * (stride + 1) + 1 + x] = (cur - pred) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = ch === 4 ? 6 : 2;
  const z = deflateSync(raw);
  // two IDAT chunks: the decoder must join them
  const cut = z.length >> 1;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", z.subarray(0, cut)), chunk("IDAT", z.subarray(cut)), chunk("IEND", Buffer.alloc(0))]);
}
const noise = (n: number, seed: number) => {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) out[i] = (s = (s * 1103515245 + 12345) >>> 0) >>> 24;
  return out;
};

describe("decodePng", () => {
  it("decodes RGBA with every row filter", async () => {
    const px = noise(13 * 11 * 4, 7);
    const png = encodePng(13, 11, 4, px);
    expect(decodePng(png)).toEqual({ width: 13, height: 11, rgba: px });
    expect((await decodePngAsync(png)).rgba).toEqual(px);
  });
  it("decodes RGB as opaque RGBA", () => {
    const px = noise(9 * 6 * 3, 3);
    const { rgba } = decodePng(encodePng(9, 6, 3, px));
    for (let i = 0; i < 9 * 6; i++) expect([...rgba.subarray(i * 4, i * 4 + 4)]).toEqual([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255]);
  });
  it("rejects what it cannot read", () => {
    expect(() => decodePng(Buffer.from("not a png at all"))).toThrow(/not a PNG/);
  });
});

describe("failureHint", () => {
  it("turns a compositor crash into a lower --concurrency", () => {
    const h = failureHint("Compositor quit: Mingw-w64 runtime failure:\n32 bit pseudo relocation", 8);
    expect(h).toMatch(/lower --concurrency \(e\.g\. 4; this render used 8\)/);
    expect(failureHint("Compositor quit", 2)).toMatch(/e\.g\. 1;/);
    expect(failureHint("something else", 8)).toBe("");
  });
});

describe("blendOver", () => {
  it("lays straight alpha over the picture", () => {
    const rgb = new Uint8Array([10, 20, 30, 10, 20, 30, 0, 0, 0]);
    blendOver(rgb, new Uint8Array([200, 200, 200, 0, 200, 100, 50, 255, 255, 255, 255, 128]));
    expect([...rgb]).toEqual([10, 20, 30, 200, 100, 50, 128, 128, 128]);
  });
});
