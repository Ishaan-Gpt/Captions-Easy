/**
 * Backward compatibility of the 0.1.x API: listLooks, describeLook, buildCaptions and recommendLooks must give the
 * exact same results for the same (old-style) inputs. Fields ADDED to describeLook's guide in 0.2.0 (look metadata)
 * are stripped before comparing; nothing else may differ. The fixture was recorded with 0.1.2;
 * `UPDATE_COMPAT=1 vitest run test/compat.test.ts` rewrites it (only for a deliberate, changelogged change).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCaptions } from "../src/captions";
import { describeLook, listLooks } from "../src/looks";
import { recommendLooks } from "../src/recommend";
import type { RecommendLooksOptions } from "../src/types";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "api-v1.json");
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

/** guide fields that 0.2.0 added (metadata), stripped so the 0.1.x part can be compared exactly */
export const ADDED_GUIDE_FIELDS = ["mood", "formality", "suits", "scripts", "complexScriptSafe", "pairsWith", "avoidWith"];
/** settings ADDED in 0.2.0 (language), stripped like the guide fields */
const ADDED_SETTINGS = ["romanize", "hinglishSpelling"];
const v1Details = (d: Record<string, unknown>) => {
  const { roles: _roles, ...all } = d;
  const rest: Record<string, unknown> = { ...all, settings: (all.settings as { key: string }[]).filter((s) => !ADDED_SETTINGS.includes(s.key)) };
  const g = rest.guide as Record<string, unknown> | undefined;
  if (!g) return rest;
  return { ...rest, guide: Object.fromEntries(Object.entries(g).filter(([k]) => !ADDED_GUIDE_FIELDS.includes(k))) };
};

const WORDS = "So in 2024 Priya built a REALLY simple app and it made 10,000 dollars in one month. Wow!".split(" ").map((text, i) => ({ text, startMs: i * 360, endMs: i * 360 + 320 }));
const QUERIES: RecommendLooksOptions[] = [
  {},
  { content: "podcast-clip", tone: "bold", footage: "busy" },
  { query: "calm luxury perfume ad, clean footage" },
  { query: "high-energy gym edit over busy footage", limit: 10 },
  { content: ["educational", "tech-ai"], platform: "linkedin", pace: "medium" },
  { tone: "playful", energy: 4, mode: "overlay", limit: 8 },
  { content: "music-lyrics", mood: "moody", footage: "dark" },
  { query: "real estate tour for instagram reels", footage: "bright" },
  { content: "comedy-meme", energy: 5, platform: "tiktok", pace: "fast" },
  { query: "documentary style explainer about ai startups" },
];

/** word ids are random per build: compare everything else */
const stable = (p: ReturnType<typeof buildCaptions>) => ({ ...p, doc: { ...p.doc, words: p.doc.words.map(({ id: _id, ...w }) => w) } });

function current(): Record<string, string> {
  const out: Record<string, string> = { listLooks: hash(listLooks()) };
  for (const l of listLooks()) {
    out[`describe:${l.number}`] = hash(v1Details(describeLook(l.number) as unknown as Record<string, unknown>));
    out[`build:${l.number}`] = hash(stable(buildCaptions({ words: WORDS, look: l.number })));
  }
  out["build:12+overrides"] = hash(stable(buildCaptions({ words: WORDS, look: 12, overrides: { "active.boxColor": "#FF3366", "glow.radius": 20 }, settings: { maxWordsPerCard: 2 } })));
  QUERIES.forEach((q, i) => (out[`recommend:${i}`] = hash(recommendLooks(q))));
  return out;
}

describe("0.1.x API results are unchanged", () => {
  const now = current();
  if (process.env.UPDATE_COMPAT === "1") {
    it("writes the fixture", () => writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`));
    return;
  }
  const recorded = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string>) : {};
  it("covers the same cases", () => expect(Object.keys(now).sort()).toEqual(Object.keys(recorded).sort()));
  for (const k of Object.keys(now)) it(k, () => expect(now[k]).toBe(recorded[k]));
});
