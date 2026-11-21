# Changelog: captionseasy

Rule zero for every release: a published look number or id never changes its rendered output, and an existing call
with the same inputs keeps its exact result. New behaviour comes only through new options or new look numbers.
"Existing look output: unchanged" below is verified, not promised, by two guards that run in CI:

- `packages/templates/src/compat.test.tsx`: renders every look at fixed moments and compares against committed
  per-look render hashes recorded before 0.2.0 (byte-identical markup).
- `packages/cli/test/compat.test.ts`: `listLooks`, `describeLook`, `buildCaptions` and `recommendLooks` results for 0.1.x
  inputs, compared against a fixture recorded with 0.1.2 (only the additive fields listed below are stripped).

## Unreleased (caption rules + caption director)

**Existing look output: changed, deliberately.** This breaks rule zero once, on Ishaan's request: every look now
keeps to the caption rules, and the per-look render hashes and the 0.1.x API fixture were re-recorded with this
change. Projects store their full style, so saved projects render exactly as before. A new `buildCaptions({ look })`
call gets the fixed look.

### Changed

- **Caption rules for every look** (`CAPTION_RULES`, `packages/templates/src/rules.ts`, measured at 1080x1920):
  - text inside the Shorts safe area (x 70-905, y 230-1480)
  - captions in the lower band (y 1060-1480), under a talking head's face
  - any word at least 46 px, the lead word 72-170 px
  - the largest word at most 3x the smallest on screen
  - at most 4 words a card

  Before the change, 63 of the 105 gallery looks broke at least one rule. Examples:
  - #29 had a 252 px word over 40 px words.
  - #67's side words were 24 px.
  - #33 and #34 were 29-31 px.
  - #20-#25, #56-#72 and #87 sat on the speaker's face.
  - #105, #30, #31 and #40 ran under the platform UI.
  - #132's highlight reached 500 px on a short word.

  Now none does. Each fix changes only the font size factor, line width, position, key-word scale or words per
  card. Fonts, colours and motion stay as they were. The fixes are in
  `packages/templates/src/looks/rules.generated.json`, each with the reason, and are written by
  `packages/web/scripts/calibrate.mjs`.
- Layout fixes where a look ignored its size:
  - #67 Spotlight: the hero and the small rows now fit the width separately, and a side word too long to read goes
    back into its row.
  - #128 Editorial Depth Stack: lines grow no larger than the lead-word limit.
  - Premium Caption 3 (#132): the highlight is capped at the lead-word limit.
- Looks composed for 5 or 6 words a card start at 4 (#50-#55, #65, #67, #128, retired #49 and two retired typo looks). A
  creator's own words-per-card choice is kept.

### Added

- **`directCaptions()`**, the caption director (`src/director`, see `src/director/SKILL.md`). Given words with times,
  optional roles, the mood and the faces, it chooses one look, the key words, the words per card and the position.
  It returns validated `buildCaptions` arguments with every taste rule checked. **`parseMeaning()`** validates the
  only thing a model may add: `{ mood, keyWords }`.
- **`CAPTION_RULES`** and **`ruleIssues()`**: the rules as numbers, and a check for a measured look.
- `packages/web/scripts/audit.mjs` (fails on any look breaking a rule), `calibrate.mjs` and `stills.mjs` (contact
  sheets with the safe area outlined).

## 0.3.0

App release: captionseasy now works inside your own app, in the browser as well as Node, and draws its captions over
your own video. Existing look output: unchanged (the per-look render hashes and the 0.1.x API fixture still match).

### Added

- **Runs in browsers, workers and edge runtimes.** `import { buildCaptions } from "captionseasy"` used to crash any
  browser bundle (`createRequire is not a function`). The package now ships a browser build, picked by bundlers through
  the `browser` / `worker` / `default` export conditions, so a web app can build and rebuild captions on the client (a
  look picker or colour control updates live). Node keeps the Node build. File helpers (`saveLooksFile`,
  `loadLooksFile`) and the add-ons (`render`, `transcribe`) throw the new `NODE_ONLY` error outside Node.
- **`captionseasy/react`.** `<Captions captions={props} video={ref} />` draws transparent captions over your own
  `<video>`, frame-locked to it (play, pause, seek, playback rate) and laid out for its size; `timeMs` drives it from any
  clock you own. `<CaptionedVideoPlayer src captions />` is the video and its captions in one tag; `useVideoTime(ref)`
  is the clock on its own. Built on `@remotion/player`'s public API (a new optional peer dependency). Marked
  `"use client"`, so Next.js server components can import it.
- **Five premium looks from Moovi:** #129 Premium Caption 1.1, #130 Premium Caption 1.2, #131 Premium Caption 2,
  #132 Premium Caption 3, #133 Premium Caption 4. Apostrophes, in-word hyphens and number separators stay on screen
  (`I've`, `editor-thons`, `4,000`).
- **`require("captionseasy")`** works on Node 20.19+ / 22.12+ (the export map has a `node` condition; it was
  `import`-only and failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- `NODE_ONLY` error code.

### Changed

- Loading the package is about twice as fast (Node: ~200 ms to ~110 ms warm): each look's complete style is resolved
  when first used instead of all ~130 at import. The resolved styles are identical.
- `buildCaptions` without a look throws `BAD_ARGS` ("buildCaptions needs a look ...") instead of `Unknown look ""`.
- The library entry no longer carries the CLI's shebang; only `dist/cli.mjs` does.
- The README starts with app use (React, Next.js, browser, Node) and says what runs where.

### Unchanged

- Every look number, id and rendered output; every 0.2.0 call and result.

## 0.2.0

Composition release: one brand across any look, several looks in one video, word roles, custom looks, look metadata,
Hinglish, layout safety. Everything is opt-in. Without the new options, every call returns what 0.1.2 returned.

### Added

- **Themes.** `buildCaptions({ theme })` applies one brand to any look: palette roles (ink, paper, accent, accent2,
  deep, pop), fonts (display, text, accent) and motion (intensity, easing family, entry speed, stagger). Ships 10 named
  themes (mono-editorial, creator-yellow, neon-night, luxe-gold, clean-corporate, pastel-pop, sport-red, tech-cyan,
  earthy-film, bollywood-masala) and accepts a custom theme object. New: `listThemes`, `describeTheme`, CLI
  `themes` / `theme <id>` / `--theme`, MCP `list_themes` / `describe_theme`.
  Existing look output: unchanged (a look without `theme` renders exactly as before).
- **Several looks in one video.** `buildCaptions({ tracks })`: hook, body, key-word stamps, numbers, list items and CTA
  as word ranges, time spans or roles, all under one theme and in one props object, with `cut`, `exit-entry` and
  `morph` transitions. `planTracks()` proposes a plan from a transcript and brief. CLI `plan` and `--tracks plan.json`,
  MCP `plan_tracks` and `tracks` on `build_captions` / `caption_video`. Needs `captionseasy-render` >= 0.2.0 to render.
  Existing look output: unchanged (without `tracks` the result has no `tracks` key and is the single-look result).
- **Word roles.** `roles: "auto" | "explicit"` (+ `roleMap`, `stamps`): connector, key, title, number, name, emphasis.
  Roles compile to per-word levers the look honours (key style, colour, size tier, entry, visibility), so two-tier
  captions and keyword-only stamps work on any look that supports them. `assignWordRoles()`, `WORD_ROLES`,
  CLI `--roles`, `--stamps`. Existing look output: unchanged (words without the new optional fields render as before).
- **Custom looks.** `deriveLook(base, overrides, { name })` returns a named custom look with a stable id, validated
  against the base look's controls; `registerLook`, `unregisterLook`, `listCustomLooks`, `loadLooksFile`,
  `saveLooksFile`; CLI `derive --save` and `--looks-file`; MCP `derive_look`.
  Existing look output: unchanged (built-in looks are never modified).
- **Look metadata + recommendLooks v2.** Every look declares mood, energy, formality, platforms, suits (talking head,
  explainer, podcast, product ad, story), scripts, pairs-with and avoid-with. `recommendLooks({ transcript, brief,
  brand, platform })` reads pace, topic, energy cues and script from the transcript and ranks deterministically with
  reasons; it never falls back to a default look. `analyzeTranscript()`, `MOODS`, `FORMALITIES`, `SUITS`, `SCRIPTS`.
  Existing look output: unchanged; `recommendLooks` with 0.1.x options returns the identical ranking.
- **Hinglish.** `settings.romanize` writes Devanagari as creators type it (pehle, chalte the, karte hain) with a
  built-in table and an optional (async) LLM callback; `settings.hinglishSpelling: "creator"` respells scholarly
  romanized Hindi (yah, kyonki) as creators type it (yeh, kyunki). `romanize`, `romanizeTranscript`,
  `hinglishSpelling`, `hinglishSpellingWords`, `detectScript`, `scriptsOf`, `lookScripts`, `devanagariFontFor`.
  Devanagari words render through bundled OFL fallback fonts (Baloo 2, Mukta, Hind, Noto Sans Devanagari,
  Tiro Devanagari Hindi). CLI `--romanize`, `--hinglish-spelling creator`.
  Existing look output: unchanged (Latin text uses byte-identical font stacks; the fallback only loads for Devanagari).
- **Layout safety.** `layout: { safeZone, avoid }`: platform safe zones per format (TikTok, Reels, Shorts, YouTube,
  LinkedIn; organic and ads) and `avoid` boxes over time (face, burned-in text, inserts). Placement picks the nearest
  clear position inside the look's allowed band. `SAFE_ZONES`, `safeZoneFor`, `safeZoneTable`, `solvePlacement`,
  `validateLayout`; CLI `safe-zones`, `--safe-zone`, `--avoid`; MCP `safe_zones`.
  Existing look output: unchanged (no `layout`, no placement change).
- **PNG-sequence overlays.** `render({ mode: "overlay", overlayFormat: "png-sequence" })`, CLI
  `--format png-sequence`, MCP `overlay_format: "png-sequence"`: a folder of transparent PNGs (`frame_%03d.png`) for
  ffmpeg and editors. `RenderResult` gains optional `frames` and `pattern`. Needs `captionseasy-render` >= 0.2.0.
  Existing look output: unchanged (mov / webm untouched).
- **Add-on version check.** Passing a 0.2.0-only option (`theme`, `roles`, `roleMap`, `stamps`, `layout`, `tracks`,
  `png-sequence`) to a 0.1.x `captionseasy-render` now fails with `ADDON_MISSING` and the upgrade command instead of
  silently dropping the option. Existing look output: unchanged (0.1.x options pass straight through).

### Changed

- **Deterministic word ids.** `buildCaptions` word ids are now a stable hash of position, text and timing instead of
  random, so the same input gives deep-equal props and identical pixels for seeded looks (ransom cut-outs etc.).
  Ids keep their 12-hex shape. Existing look output: unchanged (the render guard uses fixed ids, and nothing reads
  an id's value except as a seed). Looks that seed a detail from ids (e.g. #1 Metal Slam's crack, side picks in some
  layouts) used to pick a random variant per call; they now pick the same one every call.
- **One list of Devanagari-unsafe looks.** `LATIN_ONLY_TEMPLATES` is the single source of truth (10 letter-splitting
  templates), equal to the union of the two render checks. `lookScripts()` now also reports #118 Difference,
  #119 Cinematic Track-In, #121 Letter Cascade and #128 Editorial Depth Stack as `unsupported: ["devanagari"]`, matching
  `describeLook().guide.complexScriptSafe`, which did not change. Existing look output: unchanged (metadata only).

### Fixed

- **Bug fix — #126 Afterimage Zoom: long lines no longer run off the frame.** The line is now fitted with the look's
  real motion (camera push, spoken bump and the landing word's overshoot), and a word thrown in from the camera,
  echoes included, is capped at the frame edge while it enters. The exit zoom through the lens is unchanged.
  Existing look output: changed for #126 only (intentional fix); all other looks unchanged. Its render hash was
  deliberately re-recorded, and the fixture diff touches only `echo_zoom`.

### Additive API changes (old fields untouched)

- `describeLook(n).guide` gains `mood`, `formality`, `suits`, `scripts`, `complexScriptSafe`, `pairsWith`, `avoidWith`.
- `describeLook(n)` gains `roles` (role levers the look honours); its `settings` list gains `romanize` and
  `hinglishSpelling`.
- `LookRecommendation` gains `mood`, `pairsWith` and transcript/brief/brand reasons (only when those inputs are given).
- `CaptionsProps` gains optional `theme`, `roles`, `layout`, `tracks`; `look` gains `custom` / `baseNumber` for custom
  looks. `Word` gains optional `role`, `scale`, `entry`, `hidden`.
- `OverlayFormat` gains `"png-sequence"`; `RenderResult` gains optional `frames`, `pattern`.
- Error codes gain `BAD_THEME` and `BAD_TRACKS`.
- MCP gains `plan_tracks`, `list_themes`, `describe_theme`, `derive_look`, `safe_zones`; existing tools keep their names
  and accept the new optional arguments.

## 0.1.2

- `describeLook(n).guide`: a "when to use" guide for every look (summary, energy, tone, best/avoid for, footage, pace,
  tips, quality tier). `recommendLooks()` + CLI `recommend` + MCP `recommend_looks`: the best looks for a described
  video, with reasons.
- New look **#128 Editorial Depth Stack** (`editorial_3d_stack`): a 3D editorial caption lockup (rendered by
  `captionseasy-render` 0.1.1).
- Existing look output: unchanged (the guide is metadata; #128 is a new number).

## 0.1.1

- Package metadata: public repository links, MCP registry entry (`server.json`, `mcpName`), README badges.
- Existing look output: unchanged (no code change).

## 0.1.0

- First release: 100 caption looks, `listLooks`, `describeLook`, `buildCaptions` (validated props for the
  `CaptionedVideo` composition), `captionseasy/remotion` React components, CLI, MCP server (stdio), zero runtime
  dependencies; optional add-ons `captionseasy-render` (burn-in MP4, transparent ProRes 4444 / VP9 overlays) and
  `captionseasy-transcribe` (local Whisper with word timestamps).
