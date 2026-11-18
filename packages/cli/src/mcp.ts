/**
 * `captionseasy mcp`: the library as an MCP server over stdio (newline-delimited JSON-RPC 2.0, the MCP stdio
 * transport). Written without the MCP SDK so the core package keeps zero runtime dependencies; it implements what
 * a tools-only server needs: initialize, ping, tools/list, tools/call (+ progress notifications).
 * stdout carries the protocol, so every log line goes to stderr.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { loadAddon } from "./addons";
import { buildCaptions } from "./captions";
import { CaptionsEasyError, errorJson } from "./errors";
import { CONTENT_TYPES, TONES } from "./guide";
import { describeAnyLook as describeLook, listAllLooks as listLooks } from "./catalog";
import { deriveLook, loadLooksFile, registerLook, saveLooksFile } from "./custom";
import { safeZoneTable } from "./safety";
import { describeTheme, listThemes, THEMES } from "./themes";
import { recommendLooks } from "./recommend";
import { planTracks } from "./plan";
import type { CustomLook, LookRef, RecommendLooksOptions, ThemeRef, TranscriptWord } from "./types";
import { VERSION } from "./version";
import { readWordsFile } from "./words-file";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `CaptionsEasy gives you designed, animated caption styles ("looks") and turns timed words into ready-to-render caption props, on this machine (free, no API keys).
Choosing a look: describe the video, then call recommend_looks({ content, tone, energy, footage, platform, mode }) or recommend_looks({ query: "calm luxury perfume ad, clean footage" }). It ranks the 105 looks from their "when to use" cards and says why; pick from the top results (or show the user 2-3).
Then describe_look on the pick: its \`guide\` (usage tips, readability) and the controls you may change (brand colour, size, position, pacing).
Then build_captions({ words, look, overrides }) -> props { doc, style, settings } for the CaptionedVideo Remotion composition (npm package "captionseasy/remotion").
To get a finished video file instead: caption_video({ video, look, words }) (needs the add-on captionseasy-render; without words it also needs captionseasy-transcribe).
Have the words already? Pass them as recommend_looks({ transcript, brief, brand, platform }): pace, topic, energy cues and script are read from what is said; never pick a look without a reason.
One brand across looks: list_themes, then pass theme to describe_look / build_captions. Two-tier captions: build_captions({ roles: "auto" }); keyword-only stamps: { stamps: true }. Check describe_look(...).roles first: it says which role effects that look really shows.
A brand look to reuse: derive_look({ base, overrides, name }) returns a custom look (id "custom:...") usable as \`look\` for the rest of this session; pass save to write it to a JSON file.
Hindi/Hinglish: settings { romanize: true } writes Devanagari in Roman letters; layout { safeZone: "tiktok", avoid: [...] } keeps captions clear of platform UI and faces (safe_zones lists the zones).
Several looks in one video (hook + body + key-word stamps + CTA): plan_tracks({ words }) proposes { theme, tracks }; pass them to build_captions / caption_video as { theme, tracks } instead of look.
list_looks searches by keyword when the user names a style ("neon", "karaoke", "one word").`;

// ---------------------------------------------------------------- tool definitions (JSON Schema)

const lookSchema = { anyOf: [{ type: "integer" }, { type: "string" }], description: 'Look number (e.g. 12) or id (e.g. "hormozi_box"), from list_looks' };
const wordsSchema = {
  type: "array",
  description: "Timed words, milliseconds on the video's clock",
  items: { type: "object", properties: { text: { type: "string" }, startMs: { type: "number" }, endMs: { type: "number" } }, required: ["text", "startMs", "endMs"] },
};
const overridesSchema = { type: "object", additionalProperties: true, description: 'Style changes, keys from describe_look controls (flat dot paths), e.g. {"active.color": "#FF3366", "fontSize": 80, "position.y": 0.8}' };
const settingsSchema = { type: "object", additionalProperties: true, description: 'Pacing changes, keys from describe_look settings, e.g. {"maxWordsPerCard": 2}' };
const languageSchema = { type: "string", enum: ["en", "hinglish", "auto"] };
const themeSchema = { anyOf: [{ type: "string", enum: THEMES.map((t) => t.id) }, { type: "object", additionalProperties: true }], description: "A named theme id (list_themes) or a custom theme { id, extends?, palette?, fonts?, motion? }" };
const composeProps = {
  theme: themeSchema,
  roles: { anyOf: [{ type: "string", enum: ["auto", "explicit"] }, { type: "array", items: { type: ["string", "null"] } }, { type: "object", additionalProperties: { type: "string" } }], description: 'Word roles (connector, key, title, number, name, emphasis): "auto" fills them by rules (a word\'s own `role` wins), "explicit" uses only words[].role, or an array aligned with words / { index: role }. Absent = no roles.' },
  role_map: { type: "object", additionalProperties: true, description: 'Change how roles render, e.g. { "connector": { "size": "xs" }, "number": { "color": "pop", "entry": "slam" } }. sizes xs|s|m|l|xl, colours inherit|ink|paper|accent|accent2|deep|pop, entry none|pop|slam|rise, asKey, show' },
  stamps: { anyOf: [{ type: "boolean" }, { type: "array", items: { type: "string" } }], description: "Keyword-only stamps: show only words with these roles (true = key + number); implies roles auto" },
  layout: { type: "object", additionalProperties: true, description: 'Layout safety: { safeZone: "tiktok"|"reels"|"shorts"|"youtube"|"linkedin" or margins, avoid: [{ x, y, w, h, fromMs?, toMs?, label? }] (frame fractions) }' },
  looks_file: { type: "string", description: "A JSON file of custom looks (from derive_look save) to register first" },
  tracks: {
    type: "array",
    description:
      'Several looks in one video (then omit `look`): [{ name?, slot? hook|body|stamp|number|list|cta, look, words? [from, to) caller word indices | time? { fromMs, toMs } | role? ["key","number"] | rest? true, layer? (stamp/number slots default to 1 = drawn over the body), position? top|upper|middle|lower|bottom, overrides?, settings?, transition? "cut" | "exit-entry" | "morph" | { type, durationMs, overlapMs }, exit? fade|fall|zoom-out|blur-out|slide-up }]. ' +
      "One theme applies to all tracks. A word belongs to one track per layer (else BAD_TRACKS). plan_tracks proposes a plan.",
    items: { type: "object", additionalProperties: true, properties: { look: lookSchema }, required: ["look"] },
  },
};
const composeArgs = (a: Record<string, unknown>) => {
  if (typeof a.looks_file === "string") loadLooksFile(a.looks_file);
  return {
    ...(a.theme !== undefined ? { theme: a.theme as ThemeRef } : {}),
    ...(a.roles !== undefined ? { roles: a.roles as never } : {}),
    ...(a.role_map !== undefined ? { roleMap: a.role_map as never } : {}),
    ...(a.stamps !== undefined ? { stamps: a.stamps as never } : {}),
    ...(a.layout !== undefined ? { layout: a.layout as never } : {}),
    ...(a.tracks !== undefined ? { tracks: a.tracks as never } : {}),
  };
};
/** with tracks, `look` is optional (each track names its own) */
const lookArg = (a: Record<string, unknown>) => (a.look === undefined && a.tracks !== undefined ? {} : { look: a.look as LookRef });

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Record<string, unknown>, progress: (fraction: number, message: string) => void) => Promise<unknown> | unknown;
}

const wordsFrom = (a: Record<string, unknown>): { words?: TranscriptWord[]; language?: string } => {
  if (a.words !== undefined) return { words: a.words as TranscriptWord[] };
  if (typeof a.words_file === "string") return readWordsFile(a.words_file);
  return {};
};

export const TOOLS: Tool[] = [
  {
    name: "recommend_looks",
    title: "Recommend caption looks for a video",
    description:
      "START HERE when choosing a caption look. Describe the video and get the best-fitting looks, ranked, each with { number, id, name, score, reasons, summary, usage }. " +
      "Workflow: 1) work out what the video is (content type, mood, how busy/bright the footage is, platform, burn-in or transparent overlay); 2) recommend_looks; " +
      "3) describe_look on the pick for its guide and the controls you can change (e.g. set the brand colour); 4) build_captions (or caption_video). " +
      `Inputs (all optional, combine freely): content = ${CONTENT_TYPES.join(" | ")} (synonyms like "podcast", "tutorial", "gym", "perfume" work); ` +
      `tone = ${TONES.join(" | ")} (moods like "calm", "luxury", "hype", "fun" work too); energy 1 (calm) .. 5 (hype); footage busy | bright | dark | clean; ` +
      "platform tiktok | reels | shorts | youtube | linkedin; pace slow | medium | fast (speaker); mode overlay excludes looks that are made from the video (difference/knockout); " +
      'query = free text, e.g. "high-energy gym edit over busy footage". Scoring is deterministic: content fit, avoid-for penalties, tone and energy closeness, footage readability, platform, pace and each look\'s quality tier.',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Free-text description of the video, e.g. "calm luxury brand ad, clean footage"' },
        content: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }], description: `What the video is: ${CONTENT_TYPES.join(", ")}` },
        tone: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }], description: `Wanted tone(s): ${TONES.join(", ")} (or a mood: calm, luxury, hype, fun ...)` },
        energy: { type: "number", minimum: 1, maximum: 5, description: "1 calm/elegant .. 5 hype/punchy" },
        footage: { type: "string", enum: ["busy", "bright", "dark", "clean"], description: "What the footage behind the captions is like" },
        platform: { type: "string", enum: ["tiktok", "reels", "shorts", "youtube", "linkedin"] },
        pace: { type: "string", enum: ["slow", "medium", "fast"], description: "How fast the speaker talks" },
        mode: { type: "string", enum: ["burn", "overlay"], description: "overlay = transparent captions only (excludes looks made from the video)" },
        limit: { type: "integer", minimum: 1, maximum: 105, description: "How many looks to return (default 5)" },
        transcript: { anyOf: [{ type: "string" }, wordsSchema], description: "What is said: timed words or plain text. Pace, topic, energy cues and script are read from it (v2 ranking)" },
        brief: { type: "string", description: 'Creative brief, e.g. "confident fintech launch film, premium"' },
        brand: { anyOf: [{ type: "string" }, { type: "object", additionalProperties: true }], description: 'The brand: a theme id/object, or { colors: ["#FF3366"], tone: "premium" }' },
        script: { type: "string", enum: ["latin", "devanagari", "auto"], description: "Writing system of the captions (auto = from the transcript)" },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) =>
      recommendLooks({
        query: a.query as string | undefined,
        content: a.content as string | string[] | undefined,
        tone: a.tone as string | string[] | undefined,
        mood: a.mood as string | string[] | undefined,
        energy: a.energy as number | undefined,
        footage: a.footage as "busy" | "bright" | "dark" | "clean" | undefined,
        platform: a.platform as string | undefined,
        pace: a.pace as "slow" | "medium" | "fast" | undefined,
        mode: a.mode as "burn" | "overlay" | undefined,
        limit: a.limit as number | undefined,
        ...(a.transcript !== undefined ? { transcript: a.transcript as RecommendLooksOptions["transcript"] } : {}),
        ...(a.brief !== undefined ? { brief: a.brief as string } : {}),
        ...(a.brand !== undefined ? { brand: a.brand as RecommendLooksOptions["brand"] } : {}),
        ...(a.script !== undefined ? { script: a.script as RecommendLooksOptions["script"] } : {}),
      }),
  },
  {
    name: "list_looks",
    title: "List caption looks",
    description:
      "List CaptionsEasy's designed caption looks (105). Each has a permanent `number` and an `id`; pass either to build_captions / caption_video. " +
      "Each carries a compact `guide` { summary, energy 1-5, tone, bestFor }. To choose a look for a described video, prefer recommend_looks. " +
      'Filter with `query` (free text over name, description, tags and section, e.g. "bold", "neon", "subtitle", "one word", "karaoke") ' +
      "or `section` (viral, popular, premium, trending, creator, dynamic, typography, simple, paper, plus clean/fun/retro/tech...). " +
      "`layout: word` looks show one word at a time (punchy Shorts/TikTok); sentence/karaoke looks show short phrases (talking heads, tutorials).",
    inputSchema: { type: "object", properties: { query: { type: "string" }, tags: { type: "array", items: { type: "string" } }, section: { type: "string" }, include_custom: { type: "boolean", description: "Also list custom looks registered in this session (derive_look)" } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) =>
      a.include_custom === true
        ? listLooks({ query: a.query as string | undefined, tags: a.tags as string[] | undefined, section: a.section as string | undefined, includeCustom: true })
        : listLooks({ query: a.query as string | undefined, tags: a.tags as string[] | undefined, section: a.section as string | undefined }),
  },
  {
    name: "describe_look",
    title: "Describe a caption look",
    description:
      "One look's `guide` (when to use it: bestFor/avoidFor, energy, tone, footage readability, pace, platforms, quality, practical usage tips), its defaults and the ONLY style controls its design responds to: `controls` [{ key, type, min/max/options, default, dependsOn }] and pacing `settings` (maxWordsPerCard, pauseMs, gapBehavior...). " +
      'Use it to turn a request like "make the highlight pink and put captions higher" into overrides, e.g. { "active.color": "#FF3366", "position.y": 0.6 }. Keys not listed here are rejected.',
    inputSchema: { type: "object", properties: { look: lookSchema, theme: themeSchema }, required: ["look"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) => describeLook(a.look as LookRef, a.theme !== undefined ? { theme: a.theme as ThemeRef } : {}),
  },
  {
    name: "build_captions",
    title: "Build caption props",
    description:
      "Turn timed words + a look (+ optional overrides/settings) into validated props { doc, style, settings } for the CaptionedVideo Remotion composition " +
      '(import { CaptionedVideo } from "captionseasy/remotion"; render it in your own timeline, mode "burn" over a video or "overlay" for captions only). ' +
      "Pure and instant: no video, no rendering. Pass `words` inline or `words_file` (a JSON file with an array or { words }). Pass `out` to write the props to a file and get a short summary back instead of the full JSON. " +
      "Invalid keys/values return a clear error listing what is allowed.",
    inputSchema: {
      type: "object",
      properties: { look: lookSchema, words: wordsSchema, words_file: { type: "string" }, overrides: overridesSchema, settings: settingsSchema, language: { type: "string", description: 'Language tag stored in the doc (default "en")' }, out: { type: "string", description: "Optional path to write the props JSON" }, ...composeProps },
      // look OR tracks (no top-level anyOf: several MCP clients reject it); buildCaptions says which is missing
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: (a) => {
      const w = wordsFrom(a);
      if (!w.words) throw new CaptionsEasyError("BAD_WORDS", "Pass `words` ([{ text, startMs, endMs }]) or `words_file`.");
      const compose = composeArgs(a);
      const props = buildCaptions({ words: w.words, ...lookArg(a), overrides: a.overrides as Record<string, unknown>, settings: a.settings as Record<string, unknown>, language: (a.language as string) ?? w.language, ...compose });
      if (typeof a.out !== "string") return props;
      writeFileSync(resolve(a.out), JSON.stringify(props, null, 2));
      return { out: resolve(a.out), look: props.look, words: props.doc.words.length, ...(props.tracks ? { tracks: props.tracks.map((t) => ({ name: t.name, slot: t.slot, layer: t.layer, look: t.look, words: t.doc.words.length, transition: t.transition })) } : {}), warnings: props.warnings };
    },
  },
  {
    name: "caption_video",
    title: "Caption a video file",
    description:
      "Render captions onto a local video, entirely on this machine. Needs the add-on `captionseasy-render` (returns ADDON_MISSING with the install command if absent). " +
      "Give `words` / `words_file`; without them the video is transcribed first (needs the add-on `captionseasy-transcribe`). " +
      'mode "burn" (default) writes an MP4 with captions and the original audio; mode "overlay" writes only the captions on a transparent background, same size/length as the video: ' +
      'overlay_format "mov" (ProRes 4444, default, every NLE), "webm" (VP9 alpha, small) or "png-sequence" (a folder of transparent PNGs, `out` is the folder). `overrides`/`settings` as in build_captions. ' +
      "Returns { out, durationMs, width, height, look, words, renderMs }. Takes roughly real time to a few times real time.",
    inputSchema: {
      type: "object",
      properties: {
        video: { type: "string", description: "Absolute path of the local video file" },
        look: lookSchema,
        out: { type: "string", description: "Output path (default: next to the video)" },
        mode: { type: "string", enum: ["burn", "overlay"] },
        overlay_format: { type: "string", enum: ["mov", "webm", "png-sequence"] },
        words: wordsSchema,
        words_file: { type: "string" },
        language: languageSchema,
        overrides: overridesSchema,
        settings: settingsSchema,
        ...composeProps,
      },
      required: ["video"],
      // look OR tracks (no top-level anyOf: several MCP clients reject it); buildCaptions says which is missing
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (a, progress) => {
      const w = wordsFrom(a);
      const compose = composeArgs(a);
      const addon = await loadAddon("render");
      return addon.render({
        video: a.video as string,
        ...lookArg(a),
        out: a.out as string | undefined,
        mode: a.mode as "burn" | "overlay" | undefined,
        overlayFormat: a.overlay_format as "mov" | "webm" | "png-sequence" | undefined,
        words: w.words,
        transcript: w.words ? { words: w.words, language: w.language } : undefined,
        language: a.language as "en" | "hinglish" | "auto" | undefined,
        overrides: a.overrides as Record<string, unknown> | undefined,
        settings: a.settings as Record<string, unknown> | undefined,
        ...compose,
        onProgress: (f, stage) => progress(stage === "render" ? 0.3 + f * 0.7 : f * 0.3, stage === "render" ? "rendering" : "transcribing"),
      });
    },
  },
  {
    name: "plan_tracks",
    title: "Plan a multi-look caption track",
    description:
      "Propose several looks for one video from its transcript: a hook look on the opening line, a body look for the rest, key-word / number stamps drawn over the body, and a CTA look on a closing call to action, " +
      "all under one theme, with transitions at the hand-overs (morph where the looks allow it, else exit-entry). Deterministic: built from recommend_looks + each look's pairsWith. " +
      "Returns { theme, tracks, looks, reasons }; pass theme + tracks to build_captions / caption_video (edit any track first if you like).",
    inputSchema: {
      type: "object",
      properties: { words: wordsSchema, words_file: { type: "string" }, brief: { type: "string" }, platform: { type: "string", enum: ["tiktok", "reels", "shorts", "youtube", "linkedin"] }, theme: themeSchema, mode: { type: "string", enum: ["burn", "overlay"] } },

    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) => {
      const w = wordsFrom(a);
      if (!w.words) throw new CaptionsEasyError("BAD_WORDS", "Pass `words` ([{ text, startMs, endMs }]) or `words_file`.");
      return planTracks({ transcript: w.words, ...(typeof a.brief === "string" ? { brief: a.brief } : {}), ...(typeof a.platform === "string" ? { platform: a.platform } : {}), ...(a.theme !== undefined ? { theme: a.theme as ThemeRef } : {}), ...(a.mode !== undefined ? { mode: a.mode as "burn" | "overlay" } : {}) });
    },
  },
  {
    name: "list_themes",
    title: "List brand themes",
    description:
      "The named themes: one brand (palette roles ink/paper/accent/accent2/deep/pop, display/text/accent fonts, motion intensity/easing/speed) that applies to ANY look, " +
      "so every look in a video shares it. Pass a theme id (or a custom theme object) as `theme` to describe_look / build_captions / caption_video.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: () => listThemes(),
  },
  {
    name: "describe_theme",
    title: "Describe a theme",
    description: "One theme (by id, or a custom theme object which is validated and completed: { id, extends?, palette?, fonts?, motion? }) plus which look control each token drives. Use describe_look({ look, theme }) to see exactly what it changes on a look.",
    inputSchema: { type: "object", properties: { theme: themeSchema }, required: ["theme"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) => describeTheme(a.theme as ThemeRef),
  },
  {
    name: "derive_look",
    title: "Derive a custom look",
    description:
      "Make a named custom look from a built-in (or custom) look: `overrides` are validated against the base look's controls (same rules as build_captions), with an optional `theme` and pacing `settings`. " +
      'Returns plain JSON { kind: "custom", id: "custom:<slug>-<hash>" (stable), name, baseNumber, overrides, changed: [{ key, from, to }] }. The look is registered for this session, so its id works as `look` everywhere; pass `save` to also write it to a JSON file (reload later with looks_file).',
    inputSchema: {
      type: "object",
      properties: { base: lookSchema, name: { type: "string" }, description: { type: "string" }, overrides: overridesSchema, settings: settingsSchema, theme: themeSchema, save: { type: "string", description: "Path of a JSON file to add the look to" } },
      required: ["base", "name"],
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: (a) => {
      const look: CustomLook = deriveLook(a.base as LookRef, (a.overrides as Record<string, unknown>) ?? {}, {
        name: a.name as string,
        ...(typeof a.description === "string" ? { description: a.description } : {}),
        ...(a.theme !== undefined ? { theme: a.theme as ThemeRef } : {}),
        ...(a.settings !== undefined ? { settings: a.settings as Record<string, unknown> } : {}),
      });
      registerLook(look);
      return typeof a.save === "string" ? { ...look, saved: saveLooksFile(a.save, [look]) } : look;
    },
  },
  {
    name: "safe_zones",
    title: "Platform safe zones",
    description: "The safe-zone table: for each profile (organic, ads) x platform (tiktok, reels, shorts, youtube, linkedin) x aspect (9:16, 1:1, 4:5, 16:9), the frame fractions covered by platform UI (top/bottom/left/right, plus rails like the action column) and the source. Use a platform name as layout.safeZone in build_captions.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: () => safeZoneTable(),
  },
  {
    name: "transcribe",
    title: "Transcribe a video",
    description:
      "Speech-to-text with word timestamps for a local video/audio file, with a local Whisper model. Needs the add-on `captionseasy-transcribe` (returns ADDON_MISSING with the install command if absent); " +
      'its first call downloads the model once (~200 MB). Returns { language, durationMs, words: [{ text, startMs, endMs }] }. language: "en" (default), "hinglish" or "auto". Pass `out` to also save the words as JSON.',
    inputSchema: { type: "object", properties: { video: { type: "string", description: "Absolute path of the local video or audio file" }, language: languageSchema, out: { type: "string" } }, required: ["video"] },
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: async (a, progress) => {
      const addon = await loadAddon("transcribe");
      const t = await addon.transcribe(a.video as string, { language: a.language as "en" | undefined, onProgress: (f) => progress(f, "transcribing") });
      if (typeof a.out !== "string") return t;
      writeFileSync(resolve(a.out), JSON.stringify(t, null, 2));
      return { ...t, out: resolve(a.out) };
    },
  },
];

// ---------------------------------------------------------------- JSON-RPC over stdio

type Id = string | number;
interface Message {
  jsonrpc: "2.0";
  id?: Id;
  method?: string;
  params?: Record<string, unknown>;
}

const toolResult = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: Array.isArray(data) ? { items: data } : data,
});
const toolError = (e: unknown) => ({ content: [{ type: "text", text: JSON.stringify(errorJson(e), null, 2) }], isError: true });

/** Handles one request; returns the JSON-RPC response (or null for notifications). Exposed for tests. */
export async function handle(msg: Message, notify: (m: object) => void = () => undefined): Promise<object | null> {
  const { id, method, params = {} } = msg;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null; // notifications (initialized, cancelled ...) need no answer
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "captionseasy", title: "CaptionsEasy", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ run: _run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(params.name)}`);
      const token = (params._meta as { progressToken?: Id } | undefined)?.progressToken;
      let last = -1;
      const progress = (fraction: number, message: string) => {
        const pct = Math.floor(fraction * 100);
        if (token === undefined || pct === last) return;
        last = pct;
        notify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: pct, total: 100, message } });
      };
      try {
        return reply(toolResult(await tool.run((params.arguments as Record<string, unknown>) ?? {}, progress)));
      } catch (e) {
        return reply(toolError(e));
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

export async function startMcpServer() {
  // stdout is the protocol channel: route stray logs (libraries, add-ons) to stderr
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    // requests run concurrently; each answers when done
    void handle(msg, send).then((r) => r && send(r)).catch((e) => send({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }));
  });
  rl.on("close", () => process.exit(0));
  process.stderr.write(`captionseasy ${VERSION} MCP server ready (stdio)\n`);
}
