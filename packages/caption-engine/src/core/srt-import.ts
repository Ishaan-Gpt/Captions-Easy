import { CaptionDocSchema, newId, type CaptionDoc, type Word } from "@capseasy/shared";

const TS = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function parseTime(s: string): number | null {
  const m = TS.exec(s.trim());
  if (!m) return null;
  if (m[1] != null) return +m[1] * 3600000 + +m[2]! * 60000 + +m[3]! * 1000 + +m[4]!.padEnd(3, "0");
  return +m[5]! * 60000 + +m[6]! * 1000 + +m[7]!.padEnd(3, "0");
}

/** Import SRT or WebVTT. Each cue becomes a card (manual break); words are timed proportionally to their length. */
export function importSubtitles(input: string, language = "en"): CaptionDoc {
  const blocks = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const words: Word[] = [];
  const breaks: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    const arrow = lines.findIndex((l) => l.includes("-->"));
    if (arrow < 0) continue;
    const [a, b] = lines[arrow]!.split("-->");
    const start = parseTime(a ?? "");
    const end = parseTime((b ?? "").trim().split(/\s+/)[0] ?? "");
    if (start == null || end == null || end <= start) continue;
    const text = lines
      .slice(arrow + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = text.split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    const totalLen = tokens.reduce((n, t) => n + t.length, 0);
    let cursor = start;
    tokens.forEach((t, i) => {
      const dur = i === tokens.length - 1 ? end - cursor : Math.max(40, Math.round(((end - start) * t.length) / totalLen));
      const w: Word = { id: newId(), text: t, startMs: cursor, endMs: Math.min(end, cursor + dur), source: { text: "user" } };
      if (i === 0) breaks.push(w.id);
      words.push(w);
      cursor = w.endMs;
    });
  }

  return CaptionDocSchema.parse({ version: 2, language, words, manualBreaks: breaks.slice(1), meta: { userEdited: true } });
}
