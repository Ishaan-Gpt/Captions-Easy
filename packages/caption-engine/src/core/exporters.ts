import type { CaptionStyleV2, Page } from "@capseasy/shared";
import { parseHex } from "./color";

export type Casing = CaptionStyleV2["casing"];

export function applyCasing(text: string, casing: Casing): string {
  switch (casing) {
    case "upper": return text.toUpperCase();
    case "lower": return text.toLowerCase();
    case "title": return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    case "sentence": return text.charAt(0).toUpperCase() + text.slice(1);
    default: return text;
  }
}

const pad = (n: number, w = 2) => String(Math.trunc(n)).padStart(w, "0");

export function fmtSrtTime(ms: number, sep = ","): string {
  const t = Math.max(0, Math.round(ms));
  return `${pad(t / 3600000)}:${pad((t % 3600000) / 60000)}:${pad((t % 60000) / 1000)}${sep}${pad(t % 1000, 3)}`;
}

const pageText = (p: Page, casing: Casing) => p.lines.map((l) => applyCasing(l.map((w) => w.text.trim()).join(" "), casing)).join("\n");

export interface TextExportOptions { casing?: Casing }

export function toSrt(pages: Page[], o: TextExportOptions = {}): string {
  return pages.map((p, i) => `${i + 1}\n${fmtSrtTime(p.startMs)} --> ${fmtSrtTime(p.endMs)}\n${pageText(p, o.casing ?? "none")}\n`).join("\n");
}

export function toVtt(pages: Page[], o: TextExportOptions = {}): string {
  const body = pages.map((p) => `${fmtSrtTime(p.startMs, ".")} --> ${fmtSrtTime(p.endMs, ".")}\n${pageText(p, o.casing ?? "none")}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

export function toTxt(pages: Page[], o: TextExportOptions = {}): string {
  return pages.map((p) => pageText(p, o.casing ?? "none").replace(/\n/g, " ")).join("\n");
}

export function toJson(doc: unknown): string {
  return JSON.stringify(doc, null, 2);
}

/** ASS colour: &HAABBGGRR (alpha 00 = opaque). */
export function assColor(hex: string, alpha = 0): string {
  const c = parseHex(hex) ?? { r: 255, g: 255, b: 255 };
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `&H${h(alpha)}${h(c.b)}${h(c.g)}${h(c.r)}`;
}

const fmtAssTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 10)) * 10;
  return `${Math.floor(t / 3600000)}:${pad((t % 3600000) / 60000)}:${pad((t % 60000) / 1000)}.${pad((t % 1000) / 10)}`;
};

export interface AssOptions { width: number; height: number; casing?: Casing; karaoke?: boolean }

/** Basic-style ASS for editors that import it (font, colours, outline, shadow, position). */
export function toAss(pages: Page[], style: CaptionStyleV2, o: AssOptions): string {
  const ref = Math.min(o.width, o.height) / 1080;
  const fontSize = Math.round(style.fontSize * ref);
  const primary = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  const outline = style.stroke.enabled ? Math.max(1, Math.round(style.stroke.width * ref * 0.5)) : 0;
  const shadow = style.shadows[0] ? Math.max(0, Math.round(Math.abs(style.shadows[0].y) * ref)) : 0;
  const bold = style.fontWeight >= 700 ? -1 : 0;
  const cx = Math.round(style.position.x * o.width);
  const cy = Math.round(style.position.y * o.height);
  const header = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${o.width}`, `PlayResY: ${o.height}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,${style.fontId},${fontSize},${assColor(primary)},${assColor(style.active.color)},${assColor(style.stroke.color)},${assColor(style.shadows[0]?.color ?? "#000000", 96)},${bold},${style.fontStyle === "italic" ? -1 : 0},0,0,100,100,${style.letterSpacing},0,1,${outline},${shadow},5,20,20,20,1`,
    "", "[Events]", "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];
  const events = pages.map((p) => {
    let text: string;
    if (o.karaoke) {
      text = p.words.map((w) => `{\\k${Math.max(1, Math.round((w.endMs - w.startMs) / 10))}}${applyCasing(w.text.trim(), o.casing ?? style.casing)} `).join("").trim();
    } else {
      text = p.lines.map((l) => applyCasing(l.map((w) => w.text.trim()).join(" "), o.casing ?? style.casing)).join("\\N");
    }
    return `Dialogue: 0,${fmtAssTime(p.startMs)},${fmtAssTime(p.endMs)},Default,,0,0,0,,{\\an5\\pos(${cx},${cy})}${text}`;
  });
  return [...header, ...events, ""].join("\n");
}
