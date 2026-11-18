/**
 * captionseasy CLI. Human-friendly by default; every command takes --json for agents (one JSON document on stdout,
 * progress and notes on stderr, exit code 1 on error with {"error": {code, message}}).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, type Command } from "./args";
import { CaptionsEasyError, errorJson, isCaptionsEasyError } from "./errors";
import { describeAnyLook as describeLook, listAllLooks as listLooks } from "./catalog";
import { deriveLook, loadLooksFile, saveLooksFile, registerLook } from "./custom";
import { safeZoneTable } from "./safety";
import { describeTheme, listThemes } from "./themes";
import type { ComposeFlags } from "./args";
import type { CustomLookDetails, LookDetails, ThemeRef, TrackPlan } from "./types";
import { planTracks } from "./plan";
import { recommendLooks } from "./recommend";
import { loadAddon } from "./addons";
import { buildCaptions } from "./captions";
import { VERSION } from "./version";
import { readWordsFile } from "./words-file";

const HELP = `captionseasy ${VERSION}: designed, animated captions. Bring your words, get styled captions.

Usage
  captionseasy looks [query] [--tag <tag>] [--section <id>]   list the 105 caption looks
  captionseasy recommend ["free text"] [--content <type>] [--tone <tone>] [--energy 1-5]
      [--footage busy|bright|dark|clean] [--platform <p>] [--pace slow|medium|fast] [--overlay] [--limit n]
                                                            the best looks for a described video, with reasons
  captionseasy look <number|id>                             one look: when to use it, defaults + the controls it honours
  captionseasy build --words <words.json> --look <n|id> [--set key=value ...] [--out props.json]
                                                            validated props for the CaptionedVideo composition
  captionseasy plan --words <words.json> [--brief "..."] [--platform reels] [--theme <id>] [--out plan.json]
                                                            several looks in one video: hook / body / stamps / CTA
                                                            (then build or caption with --tracks plan.json)
  captionseasy themes                                       the named brand themes (palette, fonts, motion)
  captionseasy theme <id|theme.json>                        one theme and which look control each token drives
  captionseasy derive <n|id> --name "Brand Box" [--set key=value ...] [--theme <id>] [--save custom-looks.json]
                                                            a named custom look (stable id) from a built-in one
  captionseasy safe-zones                                   platform safe zones per format (fractions of the frame)
  captionseasy mcp                                          run as an MCP server (stdio)

With the add-on captionseasy-render (npm i captionseasy-render):
  captionseasy <video> --look <number|id> [options]         caption a video (burn in, or --overlay)
With the add-on captionseasy-transcribe (npm i captionseasy-transcribe):
  captionseasy transcribe <video> [--language en|hinglish|auto] [--out words.json]
  (and a <video> given without --words is transcribed first)

Caption options
  --look, -l <n|id>        look number (e.g. 12) or id (e.g. hormozi_box)
  --words <file.json>      words to caption ([{text,startMs,endMs}] or {words:[...]})
  --language <lang>        en (default), hinglish, auto (when transcribing)
  --set key=value          change the look (repeatable): --set active.color=#FF3366 --set maxWordsPerCard=2
  --overlay                transparent captions only (no video): ProRes 4444 .mov
  --format mov|webm|png-sequence  overlay container (webm = VP9 alpha, png-sequence = folder of
                           transparent PNGs, needs captionseasy-render >= 0.2.0); implies --overlay
  --out, -o <path>         output file (default: next to the video)
  --concurrency <n>        frames rendered in parallel
  --json                   machine-readable output

Composition options (0.2.0, build and caption; each is opt-in, nothing changes without it)
  --theme <id|theme.json>  one brand across any look: mono-editorial, creator-yellow, neon-night, luxe-gold,
                           clean-corporate, pastel-pop, sport-red, tech-cyan, earthy-film, bollywood-masala
  --roles auto|explicit    word roles (connector, key, title, number, name, emphasis): two-tier captions
  --stamps[=key,number]    keyword-only stamps: show only words with these roles (implies --roles auto)
  --romanize               write Devanagari words in Roman letters (Hinglish as creators type it)
  --hinglish-spelling creator   respell scholarly romanized Hindi (yah, kyonki) as creators type it (yeh, kyunki)
  --safe-zone <platform>   keep captions out of tiktok | reels | shorts | youtube | linkedin UI
  --avoid '<json>'         boxes to keep clear, e.g. '[{"x":0.3,"y":0.15,"w":0.4,"h":0.35,"label":"face"}]'
  --looks-file <file>      register custom looks (from \`derive --save\`) so their ids work, e.g. --look custom:brand-box-1a2b3c4
  --tracks <plan.json>     several looks in one video instead of --look: hook, body, key-word stamps, CTA, with
                           cut / exit-entry / morph transitions (write one with \`captionseasy plan --out plan.json\`)

Recommend options
  --content <type>         talking-head, podcast-clip, business-advice, motivational, educational, storytime,
                           comedy-meme, gaming, fitness, beauty-lifestyle, fashion-luxury, product-ad,
                           news-explainer, music-lyrics, travel-vlog, cinematic-trailer, real-estate, tech-ai
  --tone <tone>            bold, playful, elegant, premium, minimal, edgy, cinematic, friendly, techy, retro,
                           dramatic, clean (or a mood: calm, luxury, hype, fun ...); comma-separate several
  --energy <1-5>           1 calm ... 5 hype
  --overlay                transparent captions: skip looks made from the video
  --transcript <file|text> read pace, topic, energy cues and script from what is said
  --brief "<text>"         creative brief, e.g. "confident fintech launch, premium"
  --brand <theme>          the brand theme the captions will use
  --script latin|devanagari|auto

Examples
  npx captionseasy recommend --content podcast-clip --tone bold --footage busy
  npx captionseasy recommend "calm luxury perfume ad, clean footage"
  npx captionseasy looks bold
  npx captionseasy look 12
  npx captionseasy build --words talk.words.json --look 12 --set active.boxColor=#FF3366 --out props.json
  npx captionseasy build --words talk.words.json --look 12 --theme creator-yellow --roles auto --out props.json
  npx captionseasy recommend --transcript talk.words.json --brand clean-corporate --platform linkedin
  npx -p captionseasy -p captionseasy-render captionseasy talk.mp4 --look 12 --words talk.words.json
`;

const isTTY = process.stderr.isTTY;
function progressLine(label: string) {
  let last = -1;
  return (f: number) => {
    const pct = Math.floor(f * 100);
    if (pct === last) return;
    if (!isTTY && pct % 10 !== 0 && pct !== 100) return;
    last = pct;
    process.stderr.write(isTTY ? `\r${label} ${pct}%${pct === 100 ? "\n" : ""}` : `${label} ${pct}%\n`);
  };
}

const print = (json: boolean, data: unknown, human: () => string) => {
  process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${human()}\n`);
};

/** --theme / --brand: a named theme id, or a path to a theme .json */
function themeArg(v: string): ThemeRef {
  if (/\.json$/i.test(v) || existsSync(v)) {
    try {
      return JSON.parse(readFileSync(resolve(v), "utf8")) as ThemeRef;
    } catch (e) {
      throw new CaptionsEasyError("BAD_THEME", `Could not read the theme file ${v}: ${(e as Error).message}`);
    }
  }
  return v;
}

/** --tracks: a JSON file holding a track plan (an array, or { tracks, theme? } as `captionseasy plan --out` writes it) */
function tracksArg(path: string): { tracks: TrackPlan[]; theme?: ThemeRef } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (e) {
    throw new CaptionsEasyError((e as { code?: string }).code === "ENOENT" ? "FILE_NOT_FOUND" : "BAD_TRACKS", `Could not read the track plan ${path}: ${(e as Error).message}`);
  }
  const tracks = Array.isArray(raw) ? raw : (raw as { tracks?: unknown })?.tracks;
  if (!Array.isArray(tracks)) throw new CaptionsEasyError("BAD_TRACKS", `${path} must hold an array of tracks or { "tracks": [...], "theme"?: ... }.`);
  const theme = Array.isArray(raw) ? undefined : (raw as { theme?: ThemeRef }).theme;
  return { tracks: tracks as TrackPlan[], ...(theme !== undefined ? { theme } : {}) };
}

/** The buildCaptions/render options behind the composition flags (only those given). */
function composeOptions(c: ComposeFlags) {
  const plan = c.tracks ? tracksArg(c.tracks) : undefined;
  return {
    // the plan file's theme, unless --theme says otherwise
    ...(plan?.theme !== undefined ? { theme: plan.theme } : {}),
    ...(plan ? { tracks: plan.tracks } : {}),
    ...(c.theme ? { theme: themeArg(c.theme) } : {}),
    ...(c.roles ? { roles: c.roles } : {}),
    ...(c.stamps ? { stamps: c.stamps === true ? true : (c.stamps as never) } : {}),
    ...(c.layout ? { layout: c.layout as never } : {}),
  };
}

const lookTitle = (d: LookDetails | CustomLookDetails) => ("kind" in d && d.kind === "custom" ? `${d.name}  (${d.id}, custom look on #${d.custom.baseNumber})` : `#${d.number} ${d.name}  (${d.id})`);

async function run(c: Command): Promise<void> {
  if (c.looksFile) {
    const n = loadLooksFile(c.looksFile).length;
    if (!("json" in c && c.json) && c.cmd !== "mcp") process.stderr.write(`note: ${n} custom look(s) from ${c.looksFile}\n`);
  }
  switch (c.cmd) {
    case "help":
      process.stdout.write(HELP);
      return;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return;
    case "mcp": {
      const { startMcpServer } = await import("./mcp");
      await startMcpServer();
      return;
    }
    case "looks": {
      const looks = c.custom ? listLooks({ query: c.query, tags: c.tags, section: c.section, includeCustom: true }) : listLooks({ query: c.query, tags: c.tags, section: c.section });
      print(c.json, looks, () =>
        looks.length
          ? looks.map((l) => `${String(l.number ?? "  -").padStart(3)}  ${l.name.padEnd(28)} ${l.id.padEnd(26)} ${l.tags.join(", ")}`).join("\n") + `\n\n${looks.length} looks. Details: captionseasy look <number>`
          : "No look matches. Try a broader query.",
      );
      return;
    }
    case "recommend": {
      const o = { ...c.options };
      if (typeof o.transcript === "string" && existsSync(o.transcript)) o.transcript = readWordsFile(o.transcript).words;
      if (typeof o.brand === "string") o.brand = themeArg(o.brand);
      const recs = recommendLooks(o);
      print(c.json, recs, () =>
        recs.map((r, i) => `${i + 1}. #${r.number} ${r.name} (${r.id})  score ${r.score}\n   ${r.summary}\n   why: ${r.reasons.join("; ")}\n   tip: ${r.usage}`).join("\n\n") +
          "\n\nDetails: captionseasy look <number>",
      );
      return;
    }
    case "look": {
      const d = describeLook(c.ref, c.theme ? { theme: themeArg(c.theme) } : {});
      print(c.json, d, () => {
        const ctl = d.controls.map((x) => {
          const range = x.type === "number" ? ` (${x.min}..${x.max})` : x.type === "enum" ? ` [${x.options?.join("|")}]` : x.type === "font" ? " [font]" : "";
          return `  ${x.key.padEnd(24)} ${String(JSON.stringify(x.default)).padEnd(14)} ${x.label}${range}${x.dependsOn ? `  needs ${x.dependsOn}` : ""}`;
        });
        const st = d.settings.map((x) => `  ${x.key.padEnd(24)} ${String(JSON.stringify(x.default)).padEnd(14)} ${x.label}${x.type === "number" ? ` (${x.min}..${x.max})` : x.options ? ` [${x.options.join("|")}]` : ""}`);
        const g = d.guide;
        const fl = g ? [g.footage.worksOnBusy && "busy", g.footage.worksOnBright && "bright", g.footage.worksOnDark && "dark"].filter(Boolean).join(", ") : "";
        const when = g
          ? [
              "",
              "When to use:",
              `  ${g.summary}`,
              `  best for:  ${g.bestFor.join(", ")}`,
              `  avoid for: ${g.avoidFor.join(", ") || "-"}`,
              `  energy ${g.energy}/5 · tone: ${g.tone.join(", ")} · pace: ${g.pace.join("/")} · ${g.platforms.join(", ")}`,
              `  readable on: ${fl || "clean footage only"}${g.footage.needsVideoBehind ? " · burn-in only (made from the video)" : ""}${g.quality ? ` · quality: ${g.quality.tier} ${g.quality.score}` : ""}`,
              `  tip: ${g.usage}`,
            ]
          : [];
        const extra = [
          ...(g ? [`  mood ${g.mood} · ${g.formality} · suits ${g.suits.join(", ")} · scripts ${g.scripts.join(", ")}${g.complexScriptSafe ? "" : " (splits letters)"}`, `  pairs with: ${g.pairsWith.map((n) => `#${n}`).join(" ") || "-"} · avoid with: ${g.avoidWith.map((n) => `#${n}`).join(" ") || "-"}`] : []),
          "",
          "Word roles (buildCaptions roles / --roles auto):",
          ...d.roles.notes.map((n) => `  ${n}`),
          ...(d.theme ? ["", `Theme ${d.theme.name} changes:`, ...d.theme.applied.map((a) => `  ${a.key.padEnd(24)} ${JSON.stringify(a.from)} -> ${JSON.stringify(a.to)}`)] : []),
          ...("kind" in d && d.kind === "custom" ? ["", "Changed from the base look:", ...d.custom.changed.map((a) => `  ${a.key.padEnd(24)} ${JSON.stringify(a.from)} -> ${JSON.stringify(a.to)}`)] : []),
        ];
        return [`${lookTitle(d)}${d.retired ? "  [retired]" : ""}`, d.description, `tags: ${d.tags.join(", ")} · layout: ${d.layout} · ${d.wordsPerCard} word(s) per card`, ...when, ...extra, "", "Style (--set key=value):", ...ctl, "", "Pacing (--set key=value):", ...st].join("\n");
      });
      return;
    }
    case "plan": {
      const given = readWordsFile(c.words);
      const plan = planTracks({ transcript: given.words, ...(c.brief ? { brief: c.brief } : {}), ...(c.platform ? { platform: c.platform } : {}), ...(c.theme ? { theme: themeArg(c.theme) } : {}), ...(c.overlay ? { mode: "overlay" as const } : {}) });
      if (c.out) writeFileSync(resolve(c.out), JSON.stringify({ theme: plan.theme, tracks: plan.tracks }, null, 2));
      print(c.json, c.out ? { ...plan, out: resolve(c.out) } : plan, () =>
        [`theme: ${plan.theme}`, ...plan.looks.map((l) => `  ${l.track.padEnd(7)} #${l.number} ${l.name}`), "", ...plan.reasons.map((r) => `- ${r}`), "", c.out ? `plan -> ${resolve(c.out)}; use it with --tracks ${c.out}` : "Save it with --out plan.json, then: captionseasy build --words ... --tracks plan.json"].join("\n"),
      );
      return;
    }
    case "build": {
      const given = readWordsFile(c.words);
      const props = buildCaptions({ words: given.words, ...(c.look ? { look: c.look } : {}), overrides: c.style, settings: c.settings, language: c.language ?? given.language, ...composeOptions(c) });
      for (const w of props.warnings) process.stderr.write(`note: ${w}\n`);
      if (c.out) writeFileSync(resolve(c.out), JSON.stringify(props, null, 2));
      if (c.out && !c.json) process.stdout.write(`${props.tracks ? props.tracks.map((t) => `${t.name}: ${t.look.name} (#${t.look.number})`).join(" + ") : `${props.look.name} (#${props.look.number})`} · ${props.doc.words.length} words -> ${resolve(c.out)}\n`);
      else process.stdout.write(`${JSON.stringify(c.out ? { out: resolve(c.out), look: props.look, words: props.doc.words.length, warnings: props.warnings } : props, null, 2)}\n`);
      return;
    }
    case "themes": {
      const themes = listThemes();
      print(c.json, themes, () => themes.map((t) => `${t.id.padEnd(18)} ${t.name.padEnd(18)} ${t.mood.padEnd(9)} ${t.fonts.display} / ${t.fonts.text} / ${t.fonts.accent}\n${"".padEnd(18)} ${t.description}`).join("\n") + "\n\nUse: --theme <id> on build / caption, or describe a look under it: captionseasy look 12 --theme <id>");
      return;
    }
    case "theme": {
      const t = describeTheme(themeArg(c.ref));
      print(c.json, t, () => [`${t.name} (${t.id}) · mood ${t.mood} · scripts ${t.scripts.join(", ")}`, t.description, "", "palette:", ...Object.entries(t.palette).map(([k, v]) => `  ${k.padEnd(8)} ${v}`), "fonts:", ...Object.entries(t.fonts).map(([k, v]) => `  ${k.padEnd(8)} ${v}`), "motion:", ...Object.entries(t.motion).map(([k, v]) => `  ${k.padEnd(11)} ${v}`), "", "token -> look control:", ...Object.entries(t.tokens).map(([k, v]) => `  ${k.padEnd(17)} ${v}`)].join("\n"));
      return;
    }
    case "safe-zones": {
      const rows = safeZoneTable();
      print(c.json, rows, () => rows.map((r) => `${r.profile.padEnd(8)} ${r.platform.padEnd(9)} ${r.aspect.padEnd(5)} top ${r.top} bottom ${r.bottom} left ${r.left} right ${r.right}${r.rails ? ` + ${r.rails.map((x) => x.label).join(", ")}` : ""}${r.native ? "  (native)" : ""}`).join("\n"));
      return;
    }
    case "derive": {
      const look = deriveLook(c.base, c.style, { name: c.name, ...(c.description ? { description: c.description } : {}), ...(c.theme ? { theme: themeArg(c.theme) } : {}), ...(Object.keys(c.settings).length ? { settings: c.settings } : {}) });
      registerLook(look);
      const saved = c.save ? saveLooksFile(c.save, [look]) : undefined;
      print(c.json, saved ? { ...look, saved } : look, () =>
        [`${look.name}: ${look.id} (custom look on #${look.baseNumber})`, ...look.changed.map((a) => `  ${a.key.padEnd(24)} ${JSON.stringify(a.from)} -> ${JSON.stringify(a.to)}`), saved ? `saved to ${saved}: use it with --looks-file ${c.save} --look ${look.id}` : "Save it with --save custom-looks.json to use it later."].join("\n"),
      );
      return;
    }
    case "transcribe": {
      const t = await (await loadAddon("transcribe")).transcribe(c.video, { language: c.language, onProgress: c.json ? undefined : progressLine("transcribing") });
      if (c.out) writeFileSync(resolve(c.out), JSON.stringify(t, null, 2));
      print(c.json, c.out ? { ...t, out: resolve(c.out) } : t, () =>
        c.out ? `${t.words.length} words (${(t.durationMs / 1000).toFixed(1)} s of video) in ${(t.elapsedMs / 1000).toFixed(1)} s -> ${resolve(c.out)}` : t.words.map((w) => w.text).join(" "),
      );
      return;
    }
    case "caption": {
      const given = c.words ? readWordsFile(c.words) : undefined;
      const r = await (await loadAddon("render")).render({
        video: c.video,
        words: given?.words,
        transcript: given,
        language: c.language,
        ...(c.look ? { look: c.look } : {}),
        overrides: c.style,
        settings: c.settings,
        mode: c.overlay ? "overlay" : "burn",
        overlayFormat: c.format,
        out: c.out,
        concurrency: c.concurrency,
        ...composeOptions(c),
        onProgress: c.json ? undefined : (() => {
          const t = progressLine("transcribing");
          const r = progressLine("rendering");
          return (f: number, stage: "transcribe" | "render") => (stage === "render" ? r(f) : t(f));
        })(),
      });
      for (const w of r.warnings) process.stderr.write(`note: ${w}\n`);
      print(c.json, r, () => `${r.mode === "burn" ? "Captioned video" : "Caption overlay"}: ${r.out}${r.pattern ? ` (${r.frames ?? "?"} PNGs, ${r.pattern})` : ""}\n${r.look.name} (#${r.look.number}) · ${r.words} words · ${r.width}x${r.height} · ${(r.durationMs / 1000).toFixed(1)} s · rendered in ${(r.renderMs / 1000).toFixed(1)} s`);
      return;
    }
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const json = argv.includes("--json");
  try {
    await run(parseArgs(argv));
    return 0;
  } catch (e) {
    if (json) process.stdout.write(`${JSON.stringify(errorJson(e), null, 2)}\n`);
    else process.stderr.write(`captionseasy: ${isCaptionsEasyError(e) ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    return 1;
  }
}
