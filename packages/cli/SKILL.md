---
name: captionseasy
description: Style captions for a video with CaptionsEasy. Turn timed words into designed, animated caption props (105 looks) for a Remotion timeline, or, with the optional add-ons, render captions into an MP4 / transparent overlay and transcribe speech locally. Use when an editing pipeline or user wants captions/subtitles styled (TikTok/Reels/Shorts, karaoke, subtitles) or needs to choose a caption style that fits the video.
---

# CaptionsEasy: bring your words, get styled captions

`captionseasy` is tiny (no dependencies) and runs locally with no API keys. It needs Node.js 20 or newer.

## When to use

- You have word timings (`[{text, startMs, endMs}]`) and need captions that look designed.
- The user asks for caption styling: "TikTok style", "bold", "karaoke", "subtitle", a colour, a position or the pace.
- You need a captioned MP4 or a transparent caption layer. This needs the `captionseasy-render` add-on.
- You have no timings yet. The `captionseasy-transcribe` add-on produces them.

## Do this

1. **Pick a look for this video.** Work out what the video is, then ask for a ranked shortlist:
   - content: talking-head, podcast-clip, business-advice, motivational, educational, storytime, comedy-meme, gaming, fitness, beauty-lifestyle, fashion-luxury, product-ad, news-explainer, music-lyrics, travel-vlog, cinematic-trailer, real-estate, tech-ai
   - tone: bold, playful, elegant, premium, minimal, edgy, cinematic, friendly, techy, retro, dramatic, clean (or calm, luxury, hype, fun)
   - energy 1 (calm) to 5 (hype); footage busy / bright / dark / clean; platform tiktok / reels / shorts / youtube / linkedin; speaker pace slow / medium / fast
   ```bash
   npx -y captionseasy recommend --content podcast-clip --tone bold --footage busy --json
   npx -y captionseasy recommend "calm luxury perfume ad, clean footage" --json
   ```
   Each result has `number`, `score`, `reasons`, `summary` and `usage` (tips such as which colour to set). Take the top one, or show the user the top 2-3. Add `--overlay` when you will export transparent captions: it skips looks that are made from the video itself.
   Then read the pick's card and controls:
   ```bash
   npx -y captionseasy look 12 --json      # guide: bestFor/avoidFor, energy, tone, footage readability, usage + controls
   ```
   Searching by keyword also works (`captionseasy looks neon --json`). Safe defaults:
   - `12` Jumping Box: bold, social.
   - `105` Classic Subtitle: plain.
   - `13` Bouncy Single Word: one word at a time.

2. **Build the caption props** from your words. This step is instant, with no video and no rendering:
   ```bash
   npx -y captionseasy build --words words.json --look 12 --out props.json --json
   ```
   `props.json` holds `{ doc, style, settings }` for `CaptionedVideo` / `CaptionsOverlay` from `captionseasy/remotion`.

3. **Apply the user's changes** (colour, size, position, speed) and the card's `usage` tips (e.g. the brand colour). Read the look's controls, then pass them with `--set`:
   ```bash
   npx -y captionseasy look 12 --json
   npx -y captionseasy build --words words.json --look 12 --set active.boxColor=#FF3366 --set position.y=0.6 --set maxWordsPerCard=2 --json
   ```
   Only keys listed by `look <n>` are accepted. An invalid key or value returns `{"error": {...}}` listing what is allowed; fix it and retry.

4. **Render a video file** (needs the add-on):
   ```bash
   npx -y -p captionseasy -p captionseasy-render captionseasy "<video>" --look 12 --words words.json --json
   npx -y -p captionseasy -p captionseasy-render captionseasy "<video>" --look 12 --words words.json --overlay --json
   ```
   - The first command writes an MP4 with the captions burned in.
   - The second writes a transparent ProRes `.mov`. Add `--format webm` for a VP9 `.webm` instead.

5. **No words yet?** Transcribe locally (needs the add-on; it downloads a ~200 MB model once):
   ```bash
   npx -y -p captionseasy -p captionseasy-transcribe captionseasy transcribe "<video>" --out words.json --json
   ```
   For speech that mixes Hindi and English, add `--language hinglish`.

## Brand, roles and multi-look videos (0.2.0)

- **One brand for every look:** `--theme <id>` on `build` / the video command, or `captionseasy look 12 --theme neon-night --json` to see what it changes. `captionseasy themes --json` lists the 10 themes. A custom theme is a JSON file: `{ "id": "acme", "extends": "clean-corporate", "palette": { "accent": "#FF3366" } }`.
- **Two-tier captions:** `--roles auto` sizes connectors down and draws key words, numbers and names in the look's key style. `--stamps` shows only key words and numbers. Check `roles.levers` in `look <n> --json` first. A look with all levers off only supports stamps.
- **A reusable brand look:** `captionseasy derive 12 --name "Brand Box" --set active.boxColor=#FF3366 --save custom-looks.json --json`. Then use `--looks-file custom-looks.json --look <the custom:... id>`.
- **Have the words already?** Rank looks from them: `captionseasy recommend --transcript words.json --brand clean-corporate --platform linkedin --json`. For a video with several looks, use the pick's `guide.pairsWith` (hook + body + stamp) and avoid `guide.avoidWith`.
- **Several looks in one video (hook + body + stamps + CTA):** `captionseasy plan --words words.json --platform reels --out plan.json --json` proposes the tracks and a theme with reasons. Edit the plan if needed, then `captionseasy build --words words.json --tracks plan.json --json` or `captionseasy "<video>" --words words.json --tracks plan.json --json`. Tracks select `words: [from, to]`, `time`, `role` or `rest: true`; a word may be in one track per layer; `transition` is `cut`, `exit-entry` or `morph`.
- **Hindi:** `--romanize` writes Devanagari as Hinglish. Looks whose `guide.complexScriptSafe` is false split letters, so romanize the words or pick another look.
- **Platform UI and faces:** `--safe-zone tiktok` and `--avoid '[{"x":0.3,"y":0.1,"w":0.4,"h":0.35,"label":"face"}]'`.

## Notes

- Use absolute paths.
- An `ADDON_MISSING` error includes the exact install command in `details.install`.
- Pacing keys:
  - `maxWordsPerCard`: 2 for fast hooks, 6 or more for podcasts.
  - `pauseMs` and `holdMs`.
  - `gapBehavior=clear` blanks the screen during silences.
- MCP alternative: `npx -y captionseasy mcp` exposes `recommend_looks`, `list_looks`, `describe_look`, `build_captions`, `caption_video`, `list_themes`, `describe_theme`, `derive_look`, `safe_zones` and `transcribe`. Flow: `recommend_looks` -> `describe_look` -> `build_captions`.
