/** Tiny, dependency-free argv parser for the CLI (pure: unit-tested). */
import { CaptionsEasyError } from "./errors";
import type { RecommendLooksOptions } from "./types";

/** 0.2.0 composition flags shared by build / caption (each key only present when its flag is given). */
export interface ComposeFlags {
  /** a theme id or a path to a theme .json */
  theme?: string;
  roles?: "auto" | "explicit";
  /** true = key + number, or the listed roles */
  stamps?: true | string[];
  /** --safe-zone / --avoid */
  layout?: { safeZone?: string; avoid?: unknown };
  /** --tracks plan.json: a track plan (array, or { tracks, theme? } as written by `captionseasy plan`) */
  tracks?: string;
}

export type Command = (
  | { cmd: "help"; topic?: string }
  | { cmd: "version" }
  | { cmd: "looks"; query?: string; tags: string[]; section?: string; json: boolean; custom?: true }
  | ({ cmd: "look"; ref: string; json: boolean } & Pick<ComposeFlags, "theme">)
  | { cmd: "themes"; json: boolean }
  | { cmd: "theme"; ref: string; json: boolean }
  | { cmd: "safe-zones"; json: boolean }
  | { cmd: "derive"; base: string; name: string; description?: string; style: Record<string, string>; settings: Record<string, string>; theme?: string; save?: string; json: boolean }
  | { cmd: "recommend"; options: RecommendLooksOptions; json: boolean }
  | { cmd: "plan"; words: string; brief?: string; platform?: string; theme?: string; overlay: boolean; out?: string; json: boolean }
  | ({ cmd: "build"; words: string; look?: string; language?: string; style: Record<string, string>; settings: Record<string, string>; out?: string; json: boolean } & ComposeFlags)
  | { cmd: "transcribe"; video: string; language: "en" | "hinglish" | "auto"; out?: string; json: boolean }
  | ({
      cmd: "caption";
      video: string;
      look?: string;
      words?: string;
      language: "en" | "hinglish" | "auto";
      style: Record<string, string>;
      settings: Record<string, string>;
      overlay: boolean;
      format?: "mov" | "webm" | "png-sequence";
      out?: string;
      concurrency?: number;
      json: boolean;
    } & ComposeFlags)
  | { cmd: "mcp" }
) & { /** --looks-file: custom looks to register first */ looksFile?: string };

const VALUE_FLAGS = new Set(["look", "words", "language", "lang", "set", "out", "o", "format", "tag", "section", "concurrency", "l", "content", "tone", "mood", "energy", "footage", "platform", "pace", "mode", "limit",
  "theme", "roles", "looks-file", "name", "description", "save", "transcript", "brief", "brand", "script", "safe-zone", "avoid", "hinglish-spelling", "tracks"]);
const BOOL_FLAGS = new Set(["json", "overlay", "help", "h", "version", "v", "burn", "custom", "romanize"]);
/** --stamps takes an optional value: `--stamps` or `--stamps=key,number` */
const OPTIONAL_VALUE_FLAGS = new Set(["stamps"]);

/** Keys that belong to caption pacing (ProjectSettings) rather than the look's style. */
export const SETTINGS_KEYS = new Set(["maxWordsPerCard", "maxLines", "maxCharsPerLine", "pauseMs", "holdMs", "minCardMs", "gapBehavior", "syncOffsetMs", "removeFillers", "profanity", "romanize", "hinglishSpelling"]);

const fail = (m: string): never => {
  throw new CaptionsEasyError("BAD_ARGS", m);
};

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

export function tokenize(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const add = (k: string, v: string) => flags.set(k, [...(flags.get(k) ?? []), v]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    const m = /^--?([a-zA-Z][\w-]*)(?:=(.*))?$/s.exec(a);
    if (!m) {
      positional.push(a);
      continue;
    }
    const name = m[1]!;
    if (OPTIONAL_VALUE_FLAGS.has(name)) {
      add(name, m[2] ?? "true");
    } else if (BOOL_FLAGS.has(name)) {
      add(name, m[2] ?? "true");
    } else if (VALUE_FLAGS.has(name)) {
      const v = m[2] ?? argv[++i];
      if (v === undefined) fail(`--${name} needs a value`);
      add(name, v!);
    } else fail(`Unknown option ${a}. Run \`captionseasy --help\`.`);
  }
  return { positional, flags };
}

const LANGS = ["en", "hinglish", "auto"] as const;
function language(p: Parsed): (typeof LANGS)[number] {
  const v = (p.flags.get("language") ?? p.flags.get("lang") ?? ["en"]).at(-1)!.toLowerCase();
  const norm = v === "hi" || v === "hi-latn" ? "hinglish" : v;
  if (!(LANGS as readonly string[]).includes(norm)) fail(`--language must be one of: ${LANGS.join(", ")}`);
  return norm as (typeof LANGS)[number];
}

const last = (p: Parsed, ...names: string[]) => {
  for (const n of names) {
    const v = p.flags.get(n);
    if (v?.length) return v.at(-1);
  }
  return undefined;
};
const has = (p: Parsed, name: string) => (p.flags.get(name) ?? []).some((v) => v !== "false");

/** `--set key=value` pairs, split into style keys and pacing (settings) keys. */
export function parseSets(sets: string[]): { style: Record<string, string>; settings: Record<string, string> } {
  const style: Record<string, string> = {};
  const settings: Record<string, string> = {};
  for (const s of sets) {
    const eq = s.indexOf("=");
    if (eq <= 0) fail(`--set expects key=value (got "${s}"). Example: --set active.color=#FF3366`);
    let key = s.slice(0, eq).trim();
    const value = s.slice(eq + 1).trim();
    if (key.startsWith("settings.")) {
      settings[key.slice("settings.".length)] = value;
      continue;
    }
    if (key.startsWith("style.")) key = key.slice("style.".length);
    if (SETTINGS_KEYS.has(key)) settings[key] = value;
    else style[key] = value;
  }
  return { style, settings };
}

/** --theme / --roles / --stamps / --safe-zone / --avoid / --romanize, only the ones given. */
function composeFlags(p: Parsed, settings: Record<string, string>): ComposeFlags {
  const out: ComposeFlags = {};
  const theme = last(p, "theme");
  if (theme) out.theme = theme;
  const roles = last(p, "roles")?.toLowerCase();
  if (roles !== undefined) {
    if (roles !== "auto" && roles !== "explicit") fail('--roles must be "auto" or "explicit" (explicit = the role field of each word in --words)');
    out.roles = roles as "auto" | "explicit";
  }
  const stamps = last(p, "stamps");
  if (stamps !== undefined && stamps !== "false") out.stamps = stamps === "true" ? true : stamps.split(",").map((x) => x.trim()).filter(Boolean);
  const safeZone = last(p, "safe-zone");
  const avoid = last(p, "avoid");
  if (safeZone !== undefined || avoid !== undefined) {
    let boxes: unknown;
    if (avoid !== undefined) {
      try {
        boxes = JSON.parse(avoid);
      } catch {
        fail(`--avoid must be JSON: '[{"x":0.3,"y":0.2,"w":0.4,"h":0.3,"label":"face"}]' (got ${avoid})`);
      }
    }
    out.layout = { ...(safeZone !== undefined ? { safeZone } : {}), ...(avoid !== undefined ? { avoid: Array.isArray(boxes) ? boxes : [boxes] } : {}) };
  }
  const tracks = last(p, "tracks");
  if (tracks !== undefined) out.tracks = tracks;
  if (has(p, "romanize")) settings.romanize = "true";
  const spelling = last(p, "hinglish-spelling");
  if (spelling !== undefined) settings.hinglishSpelling = spelling;
  return out;
}

export function parseArgs(argv: string[]): Command {
  const p = tokenize(argv);
  const looksFile = last(p, "looks-file");
  const c = parseCommand(p);
  return looksFile ? { ...c, looksFile } : c;
}

function parseCommand(p: Parsed): Command {
  const json = has(p, "json");
  if (has(p, "version") || has(p, "v")) return { cmd: "version" };
  const [first, ...rest] = p.positional;
  if (has(p, "help") || has(p, "h") || !first || first === "help") return { cmd: "help", topic: first === "help" ? rest[0] : first };
  switch (first) {
    case "mcp":
      return { cmd: "mcp" };
    case "looks":
      return { cmd: "looks", query: rest.join(" ") || undefined, tags: p.flags.get("tag") ?? [], section: last(p, "section"), json, ...(has(p, "custom") ? { custom: true as const } : {}) };
    case "look":
      if (!rest[0]) fail("Usage: captionseasy look <number|id> [--theme <id|theme.json>]");
      return { cmd: "look", ref: rest[0]!, json, ...(last(p, "theme") ? { theme: last(p, "theme") } : {}) };
    case "themes":
      return { cmd: "themes", json };
    case "theme":
      if (!rest[0]) fail("Usage: captionseasy theme <id|theme.json>");
      return { cmd: "theme", ref: rest[0]!, json };
    case "safe-zones":
      return { cmd: "safe-zones", json };
    case "derive": {
      const name = last(p, "name");
      if (!rest[0] || !name) fail('Usage: captionseasy derive <base number|id> --name "Brand Box" [--set key=value ...] [--theme <id>] [--save custom-looks.json]');
      const { style, settings } = parseSets(p.flags.get("set") ?? []);
      return {
        cmd: "derive", base: rest[0]!, name: name!, style, settings, json,
        ...(last(p, "description") ? { description: last(p, "description") } : {}),
        ...(last(p, "theme") ? { theme: last(p, "theme") } : {}),
        ...(last(p, "save") ? { save: last(p, "save") } : {}),
      };
    }
    case "recommend": {
      const many = (name: string) => p.flags.get(name)?.flatMap((v) => v.split(","));
      const energy = last(p, "energy");
      const limit = last(p, "limit");
      if (energy !== undefined && !Number.isFinite(Number(energy))) fail("--energy must be a number from 1 to 5");
      if (limit !== undefined && !(Number.isInteger(Number(limit)) && Number(limit) >= 1)) fail("--limit must be a whole number >= 1");
      const mode = has(p, "overlay") ? "overlay" : last(p, "mode")?.toLowerCase();
      const options: RecommendLooksOptions = {
        ...(rest.length ? { query: rest.join(" ") } : {}),
        ...(many("content") ? { content: many("content") } : {}),
        ...(many("tone") ? { tone: many("tone") } : {}),
        ...(many("mood") ? { mood: many("mood") } : {}),
        ...(energy !== undefined ? { energy: Number(energy) } : {}),
        ...(last(p, "footage") ? { footage: last(p, "footage")!.toLowerCase() as RecommendLooksOptions["footage"] } : {}),
        ...(last(p, "platform") ? { platform: last(p, "platform")!.toLowerCase() } : {}),
        ...(last(p, "pace") ? { pace: last(p, "pace")!.toLowerCase() as RecommendLooksOptions["pace"] } : {}),
        ...(mode ? { mode: mode as RecommendLooksOptions["mode"] } : {}),
        ...(limit !== undefined ? { limit: Number(limit) } : {}),
        ...(last(p, "transcript") ? { transcript: last(p, "transcript") } : {}),
        ...(last(p, "brief") ? { brief: last(p, "brief") } : {}),
        ...(last(p, "brand") ? { brand: last(p, "brand") } : {}),
        ...(last(p, "script") ? { script: last(p, "script")!.toLowerCase() as RecommendLooksOptions["script"] } : {}),
      };
      return { cmd: "recommend", options, json };
    }
    case "plan": {
      const words = last(p, "words") ?? rest[0];
      if (!words) fail('Usage: captionseasy plan --words words.json [--brief "..."] [--platform reels] [--theme <id>] [--out plan.json]');
      return {
        cmd: "plan", words: words!, json, overlay: has(p, "overlay"), out: last(p, "out", "o"),
        ...(last(p, "brief") ? { brief: last(p, "brief") } : {}),
        ...(last(p, "platform") ? { platform: last(p, "platform")!.toLowerCase() } : {}),
        ...(last(p, "theme") ? { theme: last(p, "theme") } : {}),
      };
    }
    case "build": {
      const words = last(p, "words");
      const look = last(p, "look", "l");
      if (!words || (!look && !last(p, "tracks"))) fail("Usage: captionseasy build --words words.json --look <number|id> [--set key=value ...] [--out props.json]  (or --tracks plan.json instead of --look)");
      const { style, settings } = parseSets(p.flags.get("set") ?? []);
      const compose = composeFlags(p, settings);
      const lang = last(p, "language", "lang");
      return { cmd: "build", words: words!, ...(look ? { look } : {}), ...(lang ? { language: lang } : {}), style, settings, out: last(p, "out", "o"), json, ...compose };
    }
    case "transcribe":
      if (!rest[0]) fail("Usage: captionseasy transcribe <video> [--language en|hinglish|auto] [--out words.json]");
      return { cmd: "transcribe", video: rest[0]!, language: language(p), out: last(p, "out", "o"), json };
  }
  // captionseasy <video> --look ...   (or: captionseasy caption|render <video> ...)
  const video = first === "caption" || first === "render" ? rest[0] : first;
  if (!video) fail("Usage: captionseasy <video> --look <number|id>");
  const extra = (first === "caption" || first === "render" ? rest.slice(1) : rest);
  if (extra.length) fail(`Unexpected argument "${extra[0]}". Options go after the video, e.g. --look 12 --set active.color=#FF3366`);
  const look = last(p, "look", "l");
  if (!look && !last(p, "tracks")) fail("Pick a look with --look <number|id>. See them with `captionseasy looks`. (Several looks: --tracks plan.json)");
  const format = last(p, "format")?.toLowerCase();
  if (format && format !== "mov" && format !== "webm" && format !== "png-sequence") fail("--format must be mov, webm or png-sequence");
  const conc = last(p, "concurrency");
  const concurrency = conc === undefined ? undefined : Number(conc);
  if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) fail("--concurrency must be a whole number >= 1");
  const { style, settings } = parseSets(p.flags.get("set") ?? []);
  const compose = composeFlags(p, settings);
  return {
    ...compose,
    cmd: "caption",
    video: video!,
    ...(look ? { look } : {}),
    words: last(p, "words"),
    language: language(p),
    style,
    settings,
    overlay: has(p, "overlay") || Boolean(format),
    format: format as "mov" | "webm" | "png-sequence" | undefined,
    out: last(p, "out", "o"),
    concurrency,
    json,
  };
}
