# captionseasy

[![npm](https://img.shields.io/npm/v/captionseasy)](https://www.npmjs.com/package/captionseasy) [![downloads](https://img.shields.io/npm/dm/captionseasy)](https://www.npmjs.com/package/captionseasy) [![GitHub stars](https://img.shields.io/github/stars/Ishaan-Gpt/Captions-Easy?style=social)](https://github.com/Ishaan-Gpt/Captions-Easy) [![license](https://img.shields.io/npm/l/captionseasy)](./LICENSE)

**Animated captions for your app.** Give it words with timings, pick one of 105 designed looks, and you get captions that play over your own video, in React, Next.js, a plain web page or Node. It runs on your machine and in your users' browsers, with no server, no API key and no runtime dependencies.

```bash
npm i captionseasy                          # the looks and the caption builder (works everywhere)
npm i react remotion @remotion/player       # only to draw them in React
```

## Captions over your video, in React

```tsx
import { useMemo, useRef } from "react";
import { buildCaptions } from "captionseasy";
import { Captions } from "captionseasy/react";

export function VideoWithCaptions({ src, words }: { src: string; words: { text: string; startMs: number; endMs: number }[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const captions = useMemo(() => buildCaptions({ words, look: 12 }), [words]);
  return (
    <div style={{ position: "relative" }}>
      <video ref={video} src={src} controls />
      <Captions captions={captions} video={video} />
    </div>
  );
}
```

`<Captions>` follows the video as it plays, pauses, seeks or changes speed, and lays the captions out for the video's own size. `buildCaptions` takes about a millisecond, so a look picker or a colour control can rebuild the captions on every change and the user sees them update live:

```tsx
const captions = useMemo(() => buildCaptions({ words, look, overrides: { "active.boxColor": color } }), [words, look, color]);
```

Want the video and the captions in one tag? `<CaptionedVideoPlayer src={url} captions={captions} videoProps={{ controls: true }} />`. Driving the time yourself (a timeline, a scrubber)? Pass `timeMs={ms} width={1080} height={1920}` instead of `video`.

**Next.js:** `buildCaptions` works in server and client components alike, and `captionseasy/react` is already marked `"use client"`, so a server page can build the props and hand them to it:

```tsx
// app/page.tsx (a server component)
import { buildCaptions } from "captionseasy";
import { CaptionedVideoPlayer } from "captionseasy/react";
import words from "./talk.words.json"; // [{ text, startMs, endMs }]

export default function Page() {
  const captions = buildCaptions({ words, look: 131 });
  return <CaptionedVideoPlayer src="/talk.mp4" captions={captions} videoProps={{ controls: true }} />;
}
```

`<Captions>` is drawn by [Remotion](https://www.remotion.dev)'s Player, so Remotion's licence applies (free for individuals and companies of up to 3 people). Pass `playerProps={{ acknowledgeRemotionLicense: true }}` once you have checked it, and the console notice goes away.

## Other places it runs

- **A web page without React:** [`captionseasy-web`](#in-any-web-page-no-framework-captionseasy-web) draws the same captions on a `<canvas>` or over a `<video>`, and exports transparent overlay frames in the browser.
- **Node, a server or an agent:** the props are plain JSON, so you can build them anywhere and send them to the client. The CLI and the MCP server do the same from a terminal or an AI agent.
- **A finished video file:** the [`captionseasy-render`](#optional-rendering-captionseasy-render) add-on burns the captions into an MP4, or writes a transparent overlay.

| | Node 20+ | Browser, worker, edge |
| --- | :---: | :---: |
| `buildCaptions`, `listLooks`, `describeLook`, `recommendLooks`, themes, tracks, roles, `deriveLook` | yes | yes |
| `captionseasy/react`, `captionseasy/remotion` | in your Remotion project or SSR | yes |
| `saveLooksFile`, `loadLooksFile` | yes | no: `NODE_ONLY` (keep custom looks as JSON yourself) |
| `render`, `transcribe` | with their add-on | no: `NODE_ONLY` |

The package loads with `import` everywhere and with `require()` on Node 20.19+ / 22.12+. Bundlers pick the browser build on their own.

## From the terminal

You already have word timings, for example from your editor, your ASR or your agent:

```json
[{ "text": "Stop", "startMs": 380, "endMs": 840 }, { "text": "scrolling", "startMs": 840, "endMs": 1080 }]
```

```bash
npx captionseasy looks bold                     # pick a look (search: neon, karaoke, subtitle, "one word" ...)
npx captionseasy look 12                        # what can I change on look #12?
npx captionseasy build --words words.json --look 12 --set active.boxColor=#FF3366 --out props.json
```

`props.json` holds `{ doc, style, settings }`, validated and complete, ready for `<Captions captions={props}>` or your own Remotion timeline. Every command takes `--json` for scripts and agents.

Every look has a permanent number (`#12 Jumping Box`, `#129 Premium Caption 1.1`) and lists the few controls it really responds to. A key it doesn't honour is rejected with a clear error instead of silently doing nothing.

## Choosing a look

Every look has a "when to use" card: what it looks like, what content it suits (and doesn't), energy 1 (calm) to 5 (hype), tone, readability on busy / bright / dark footage, speaker pace, platforms, a quality rating and practical tips. Describe the video and let `recommend` rank the looks:

```bash
npx captionseasy recommend --content podcast-clip --tone bold --footage busy
npx captionseasy recommend "calm luxury perfume ad, clean footage" --json
npx captionseasy look 118          # the full card + the controls
```

```ts
import { recommendLooks } from "captionseasy";
recommendLooks({ content: "fitness", energy: 5, footage: "busy", platform: "reels", mode: "overlay" });
// [{ number, id, name, score, reasons: ["best for fitness", "energy 5/5", "readable on busy footage", ...], summary, usage }]
```

The scoring is deterministic (no model, no network): content fit, avoid-for penalties, tone and energy closeness, footage readability, platform, pace and the look's quality tier. `mode: "overlay"` skips the two looks that are made from the video itself (#118 Difference, #87 Video-Through Knockout).

| field | values |
| --- | --- |
| `content` (`bestFor` / `avoidFor`) | talking-head, podcast-clip, business-advice, motivational, educational, storytime, comedy-meme, gaming, fitness, beauty-lifestyle, fashion-luxury, product-ad, news-explainer, music-lyrics, travel-vlog, cinematic-trailer, real-estate, tech-ai |
| `tone` | bold, playful, elegant, premium, minimal, edgy, cinematic, friendly, techy, retro, dramatic, clean (moods like calm, luxury, hype, fun also work) |
| `energy` | 1 calm / elegant ... 5 hype / punchy |
| `footage` | busy, bright, dark, clean |
| `platform` | tiktok, reels, shorts, youtube, linkedin |
| `pace` | slow, medium, fast |

<!-- looks-guide:start (generated by scripts/guide-table.ts; do not edit) -->

| # | Look | Best for | Energy (1-5) | Tone | Quality |
| ---: | --- | --- | :---: | --- | --- |
| 1 | Metal Slam + Script | motivational, cinematic-trailer, fitness | 4 | premium, dramatic, bold | goated 10 |
| 2 | Soft Glow | beauty-lifestyle, travel-vlog, storytime | 2 | minimal, friendly, elegant | goated 9 |
| 3 | Neon Caps + Script | motivational, storytime, music-lyrics | 3 | premium, dramatic, edgy | goated 9.5 |
| 4 | Giant Serif Behind | music-lyrics, cinematic-trailer, fashion-luxury | 3 | dramatic, cinematic, elegant | mid 7 |
| 5 | Italic Over Ice Caps | travel-vlog, beauty-lifestyle, music-lyrics | 3 | elegant, cinematic | mid 7.5 |
| 6 | Serif Accent Glow | talking-head, podcast-clip, beauty-lifestyle | 2 | elegant, premium, minimal | goated 9.5 |
| 7 | 3-Line Stagger | talking-head, business-advice, motivational | 4 | bold, clean | goated 9 |
| 8 | 3-Line Glow Hero | talking-head, tech-ai, business-advice | 4 | bold, clean, techy | goated 8.5 |
| 9 | Giant Italic Hero | podcast-clip, storytime, motivational | 3 | cinematic, elegant, dramatic | goated 9 |
| 10 | Script Hero Pop | storytime, motivational, talking-head | 3 | friendly, playful | mid 7.5 |
| 11 | Kinetic Big Word | motivational, business-advice, comedy-meme | 5 | bold, playful | goated 9 |
| 12 | Jumping Box | business-advice, talking-head, podcast-clip | 4 | bold, clean | goated 10 |
| 13 | Bouncy Single Word | gaming, comedy-meme, fitness | 5 | bold, playful | goated 9 |
| 14 | Comic Tilt | comedy-meme, gaming | 5 | playful, bold, retro | mid 7.5 |
| 15 | Chat Bubble | storytime, comedy-meme | 2 | friendly, playful, clean | mid 7 |
| 16 | Underline Sweep | educational, news-explainer, tech-ai | 2 | clean, friendly | mid 7 |
| 17 | Yellow Highlighter | educational, news-explainer, business-advice | 2 | clean, friendly | mid 7 |
| 18 | Three-Colour Keywords | talking-head, business-advice, podcast-clip | 4 | bold, clean | goated 9.5 |
| 19 | Gold Bevel Caps | motivational, business-advice, fitness | 4 | premium, bold, dramatic | mid 8 |
| 20 | Solid Label Card | business-advice, comedy-meme, talking-head | 5 | bold, playful | goated 9 |
| 21 | Tilted Label Stack | talking-head, business-advice, comedy-meme | 4 | playful, bold, friendly | goated 9 |
| 22 | Cream Strip Lines | business-advice, educational, news-explainer | 2 | clean, minimal | goated 8.5 |
| 23 | Tilted Rising Rows | comedy-meme, storytime, motivational | 4 | playful, bold | mid 8 |
| 24 | Whip-In Cards | talking-head, business-advice, motivational | 4 | bold, clean | goated 8.5 |
| 25 | Light to Bold | podcast-clip, business-advice, educational | 2 | minimal, clean, elegant | mid 7.5 |
| 26 | Orange Stamp Word | business-advice, motivational, news-explainer | 4 | bold, edgy | goated 9 |
| 27 | Red Plate Ticker | news-explainer, business-advice, comedy-meme | 5 | bold, edgy | goated 9 |
| 28 | Sand Word Tiles | beauty-lifestyle, storytime, travel-vlog | 2 | friendly, playful | goated 8.5 |
| 29 | Colour Block Cut-In | tech-ai, news-explainer, business-advice | 4 | techy, bold, edgy | goated 8.5 |
| 30 | Motion-Blur Whip | fitness, gaming, travel-vlog | 4 | bold, clean | mid 7.5 |
| 31 | Fat Bar Pop | talking-head, business-advice, podcast-clip | 4 | bold, clean | goated 8.5 |
| 32 | Skewed Ice Headline | tech-ai, business-advice, gaming | 4 | bold, techy, premium | goated 9 |
| 33 | Shine-Streak Italic Title | tech-ai, gaming, travel-vlog | 3 | premium, techy | mid 8 |
| 34 | Neon Gradient Title | gaming, tech-ai, music-lyrics | 4 | techy, edgy | mid 7 |
| 35 | Glossy Serif + Script | motivational, storytime, beauty-lifestyle | 3 | premium, elegant | goated 9 |
| 36 | Golden Glow Headline | motivational, fashion-luxury, beauty-lifestyle | 3 | premium, elegant, dramatic | goated 9.5 |
| 37 | Shine-Band Hero Word | motivational, business-advice, talking-head | 4 | bold, premium | goated 9 |
| 38 | Overshoot Glide Stack | talking-head, tech-ai, travel-vlog | 3 | clean, friendly | mid 7.5 |
| 39 | Serif Shine Sweep | motivational, storytime, beauty-lifestyle | 3 | premium, elegant | goated 8.5 |
| 40 | Arcade Door Pop | gaming, comedy-meme | 4 | playful, bold | mid 6.5 |
| 41 | Highlight Block Middle | business-advice, motivational, talking-head | 4 | bold, clean | goated 9 |
| 42 | Three-Part Glide In | talking-head, motivational, storytime | 3 | bold, friendly | mid 8 |
| 43 | Fusion Type-On | tech-ai, educational, business-advice | 3 | techy, clean | mid 7 |
| 44 | Sparkle Script | beauty-lifestyle, fashion-luxury, storytime | 2 | elegant, playful | mid 7.5 |
| 45 | Pastel Bubble Outline | comedy-meme, beauty-lifestyle, storytime | 3 | playful, friendly | mid 7 |
| 50 | Rotating Orange Blend | real-estate, business-advice, travel-vlog | 3 | premium, bold | mid 7.5 |
| 51 | Rotating Editorial Stack | talking-head, business-advice, podcast-clip | 3 | clean, bold, minimal | goated 9 |
| 52 | Rotating Warm Script | beauty-lifestyle, storytime, motivational | 3 | premium, elegant | mid 7 |
| 53 | Blue Box Wipe Reel | business-advice, tech-ai, product-ad | 3 | clean, bold | goated 9 |
| 55 | Luxe Gradient Hero | fashion-luxury, motivational, beauty-lifestyle | 3 | premium, elegant, dramatic | goated 8.5 |
| 56 | Banded Big Word | travel-vlog, storytime, beauty-lifestyle | 3 | retro, playful | mid 7 |
| 59 | Huge Word + Red Script | motivational, fitness, business-advice | 4 | bold, dramatic | goated 9 |
| 61 | Red Neon Caps | music-lyrics, gaming, cinematic-trailer | 4 | edgy, dramatic, retro | mid 7 |
| 62 | Big/Small Split | talking-head, business-advice, podcast-clip | 3 | clean, minimal, bold | mid 8 |
| 63 | Red Block Wipe | business-advice, news-explainer, motivational | 3 | premium, bold | goated 9 |
| 64 | Punch Line Slide | motivational, business-advice, comedy-meme | 4 | bold, dramatic | goated 8.5 |
| 65 | Scatter Fly-In | music-lyrics, comedy-meme, gaming | 5 | playful, bold | mid 7 |
| 67 | Spotlight Hero + Side Words | tech-ai, product-ad, business-advice | 3 | techy, bold | mid 7 |
| 69 | Editorial Indent | storytime, podcast-clip, fashion-luxury | 2 | elegant, cinematic, minimal | mid 7 |
| 70 | Plain Lowercase | podcast-clip, educational, talking-head | 1 | minimal, clean | mid 6 |
| 71 | Fade-In Words | podcast-clip, educational, storytime | 1 | minimal, clean | low 4 |
| 72 | Stacked Word Slam | motivational, fitness, cinematic-trailer | 5 | bold, dramatic | mid 7 |
| 73 | Pink Script Accent | beauty-lifestyle, storytime, travel-vlog | 2 | elegant, friendly | goated 8.5 |
| 74 | Italic Word Glow | beauty-lifestyle, podcast-clip, storytime | 2 | minimal, elegant | low 4.5 |
| 76 | Cycling Colour Pop | gaming, comedy-meme, fitness | 5 | playful, bold | mid 7 |
| 78 | Mint Tight Caps Pop | fitness, talking-head, gaming | 4 | bold, clean | mid 6.5 |
| 79 | Yellow Jump Box | business-advice, talking-head, podcast-clip | 4 | bold, clean | mid 7 |
| 80 | Hollow Caps Fill | music-lyrics, motivational, fitness | 3 | bold, edgy | low 4 |
| 81 | Karaoke Pill | podcast-clip, talking-head, educational | 2 | clean, minimal, friendly | goated 8.5 |
| 82 | Text Selection Highlight | tech-ai, educational, business-advice | 2 | techy, clean, playful | mid 7 |
| 85 | Centre-Peak Gradient | travel-vlog, beauty-lifestyle, music-lyrics | 2 | minimal, playful | mid 6.5 |
| 87 | Video-Through Knockout | music-lyrics, cinematic-trailer, fashion-luxury | 4 | dramatic, cinematic, edgy | goated 9 |
| 89 | Ransom Cut-Outs | comedy-meme, storytime, music-lyrics | 4 | edgy, playful, retro | goated 8.5 |
| 90 | Stop-Motion Ransom | music-lyrics, comedy-meme | 5 | edgy, playful, retro | mid 7.5 |
| 91 | Torn Paper Cutout | beauty-lifestyle, storytime, travel-vlog | 2 | playful, friendly, retro | mid 7 |
| 92 | Neon Frame Lines | tech-ai, fashion-luxury, product-ad | 3 | premium, techy, elegant | mid 8 |
| 93 | Phone Notification | storytime, comedy-meme, product-ad | 2 | friendly, clean, playful | goated 8.5 |
| 98 | Gradient Word | gaming, fitness, music-lyrics | 5 | bold, playful | mid 6.5 |
| 101 | Hopping Word | comedy-meme, storytime, gaming | 3 | playful, friendly | mid 6.5 |
| 102 | Pastel Box | storytime, beauty-lifestyle, talking-head | 2 | friendly, playful | mid 7 |
| 103 | Marker Scribble | comedy-meme, storytime, educational | 3 | playful, retro | mid 6 |
| 104 | Dim Until Spoken | podcast-clip, business-advice, educational | 1 | minimal, clean, premium | mid 7.5 |
| 105 | Classic Subtitle | cinematic-trailer, news-explainer, podcast-clip | 1 | minimal, cinematic, clean | mid 6 |
| 107 | Read-Along Light Up | podcast-clip, educational, music-lyrics | 2 | clean, minimal | mid 7 |
| 108 | Italic Serif Wipe | fashion-luxury, real-estate, beauty-lifestyle | 1 | elegant, premium | mid 6.5 |
| 109 | Wide Tracked Word | motivational, fitness, cinematic-trailer | 4 | bold, cinematic, dramatic | mid 7 |
| 111 | VHS Colour Split | gaming, music-lyrics, comedy-meme | 3 | retro, techy | low 3.5 |
| 114 | Typewriter Terminal | tech-ai, educational, comedy-meme | 2 | techy, retro | low 4 |
| 117 | Cartoon 3-Line | comedy-meme, storytime, gaming | 3 | playful, friendly | mid 6.5 |
| 118 | Difference | fashion-luxury, music-lyrics, cinematic-trailer | 4 | edgy, premium, bold | new (unrated) |
| 119 | Cinematic Track-In | cinematic-trailer, travel-vlog, fashion-luxury | 2 | cinematic, elegant, premium | new (unrated) |
| 120 | RGB Split Slam | gaming, fitness, music-lyrics | 5 | edgy, bold, dramatic | new (unrated) |
| 121 | Letter Cascade | product-ad, tech-ai, talking-head | 3 | premium, clean | new (unrated) |
| 122 | Light Slit Reveal | fashion-luxury, real-estate, product-ad | 1 | elegant, premium, cinematic | new (unrated) |
| 123 | 3D Drum Flip | product-ad, tech-ai, motivational | 4 | bold, cinematic, premium | new (unrated) |
| 124 | Signal Tear | tech-ai, gaming, music-lyrics | 4 | techy, edgy | new (unrated) |
| 125 | Liquid Chrome | product-ad, motivational, gaming | 4 | premium, bold, retro | new (unrated) |
| 126 | Afterimage Zoom | music-lyrics, gaming, fitness | 5 | bold, dramatic | new (unrated) |
| 127 | Kinetic Camera | motivational, business-advice, cinematic-trailer | 4 | cinematic, premium, bold | new (unrated) |
| 128 | Editorial Depth Stack | storytime, talking-head, motivational | 4 | premium, cinematic, bold | new (unrated) |
| 129 | Premium Caption 1.1 | talking-head, motivational, business-advice | 4 | bold, premium | new (unrated) |
| 130 | Premium Caption 1.2 | talking-head, storytime, motivational | 4 | bold, premium, edgy | new (unrated) |
| 131 | Premium Caption 2 | motivational, business-advice, storytime | 3 | premium, elegant, cinematic | new (unrated) |
| 132 | Premium Caption 3 | talking-head, storytime, educational | 3 | premium, minimal, edgy | new (unrated) |
| 133 | Premium Caption 4 | motivational, storytime, travel-vlog | 5 | bold, dramatic, cinematic | new (unrated) |

<!-- looks-guide:end -->

## Library

```ts
import { listLooks, describeLook, recommendLooks, buildCaptions } from "captionseasy";

recommendLooks({ query: "gaming hype" }); // ranked [{ number, id, name, score, reasons, summary, usage }]
listLooks({ query: "bold" });   // [{ number, id, name, section, tags, description, layout, wordsPerCard, guide: { summary, energy, tone, bestFor } }]
describeLook(12);               // { ...summary, guide, defaults, controls: [{ key, type, min, max, options, default, dependsOn }], settings: [...] }

const props = buildCaptions({
  words,                                                    // [{ text, startMs, endMs }]
  look: 12,                                                 // number or id ("hormozi_box")
  overrides: { "active.boxColor": "#FF3366", "position.y": 0.6 },
  settings: { maxWordsPerCard: 2 },                         // pacing
});
// { doc, style, settings, look: { number, id, name }, warnings }
```

Errors are `CaptionsEasyError` objects with a stable `code`: `UNKNOWN_LOOK`, `BAD_OVERRIDE`, `BAD_SETTINGS`, `BAD_WORDS`, `BAD_ARGS`, `FILE_NOT_FOUND`, `ADDON_MISSING`, `NO_AUDIO`, `NO_VIDEO`, `TRANSCRIBE_FAILED`, `RENDER_FAILED` or `BAD_THEME`. The `details` field carries machine-readable context, such as the valid keys, the allowed range or the install command.

**Overrides** can be flat dot paths (`{"active.color": "#FF3366"}`) or nested objects. Colours can be written as `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`/`rgba()`/`hsl()`, or a basic name.

A control with `dependsOn` only works once another key is set:
- Harmless switches (outline, shadow, glow, background, gradient) are turned on for you, with a warning.
- Switches that change the motion are never turned on for you; you get an error saying what to set.

## Themes: one brand across every look

A theme is a set of tokens: palette roles (`ink`, `paper`, `accent`, `accent2`, `deep`, `pop`), three fonts (`display`, `text`, `accent`) and a motion feel (`intensity`, `easing`, `entrySpeed`, `stagger`). Pass one to `buildCaptions` and it applies to **any** look, so every look in a video shares one brand.

```ts
import { listThemes, describeLook, buildCaptions } from "captionseasy";

listThemes();                                   // the 10 named themes
describeLook(12, { theme: "neon-night" });       // defaults as themed + theme.applied: [{ key, from, to }]
buildCaptions({ words, look: 12, theme: "neon-night", overrides: { fontSize: 70 } }); // overrides still win
buildCaptions({ words, look: 12, theme: { id: "acme", extends: "clean-corporate", palette: { accent: "#FF3366" } } });
```

Named themes: `mono-editorial`, `creator-yellow`, `neon-night`, `luxe-gold`, `clean-corporate`, `pastel-pop`, `sport-red`, `tech-cyan`, `earthy-film`, `bollywood-masala` (its fonts also draw Devanagari).

How tokens reach a look:
- Only controls the look honours **without switching anything on** are themed. A look with no outline does not get one.
- Polarity is kept. Light text over video takes `ink`; dark text on a plate takes `deep`; light plates take `paper`. When text sits on a themed plate, the most readable palette colour is picked.
- Neutral "material" gradients (metal, chrome) are kept. Colourful gradients become `accent` -> `accent2`. A look without a colour accent keeps none.
- Fonts: heavy or all-caps looks take `display`, reading looks take `text`, a separate key-word font takes `accent`.
- Motion multiplies the look's own intensity and speed, so a calm look stays calmer than a hype one.

A custom theme only needs an `id`. Everything else falls back to `extends` (default `mono-editorial`). Invalid tokens throw `BAD_THEME`. CLI: `captionseasy themes`, `captionseasy theme neon-night`, `--theme <id|theme.json>`.

## Word roles: two-tier captions and keyword stamps

Every word can have a role: `connector`, `key`, `title`, `number`, `name` or `emphasis`. Roles are **opt-in**. Without `roles`, the output is exactly what it always was.

```ts
buildCaptions({ words, look: 12, roles: "auto" });         // rules fill every word (a word's own `role` wins)
buildCaptions({ words, look: 12, roles: ["title", null, "key"] }); // or explicit, aligned with words ({ 4: "number" } works too)
buildCaptions({ words, look: 109, stamps: true });           // keyword-only stamps: only key + number words are shown
buildCaptions({ words, look: 12, roles: "auto", roleMap: { connector: { size: "xs" }, number: { color: "pop", entry: "slam" } } });
assignWordRoles(words);                                      // just the roles
```

The rules are deterministic: figures and number words (including romanized Hindi ones like `ek`, `lakh`, `crore`); quoted titles; shouted words; capitalised names mid-sentence and acronyms; function words (English and romanized Hindi); and each card's key word.

How roles render: each look's role map sets a size tier, a palette colour, its own entrance and whether the word is drawn as the look's key word. Only effects the look really shows are applied. Which ones that is was **measured** by rendering every look with and without each effect. `describeLook(n).roles` lists them:

```jsonc
"roles": { "levers": { "emphasis": true, "color": true, "size": true, "entry": true },
           "map": { "connector": { "size": "s" }, "number": { "size": "l", "color": "accent2", "asKey": true, "entry": "pop" }, ... },
           "notes": ["two-tier sizing: connectors shrink, key words and numbers grow", ...] }
```

Composed lockups set their own word hierarchy. For those looks, roles work only as stamps, and `buildCaptions` warns you. The roles are kept on `doc.words[].role`.

## Custom looks

```ts
import { deriveLook, registerLook, saveLooksFile, loadLooksFile } from "captionseasy";

const brand = deriveLook(12, { "active.boxColor": "#FF3366", fontSize: 72 }, { name: "Brand Box", theme: "tech-cyan" });
// { kind: "custom", id: "custom:brand-box-1hefsjd", name, baseNumber: 12, baseId, overrides, theme, changed: [{ key, from, to }] }
buildCaptions({ words, look: brand });                    // use the object directly...
registerLook(brand);                                      // ...or register it and use its id anywhere a look goes
buildCaptions({ words, look: "custom:brand-box-1hefsjd" });
describeLook(brand.id);                                   // the base look's guide + controls with the custom values + custom.changed
listLooks({ includeCustom: true });
saveLooksFile("custom-looks.json", [brand]);              // nothing touches the disk unless you give a path
```

- `deriveLook` validates overrides exactly like `buildCaptions`.
- The id is a hash of the base, the overrides, the theme and the pacing. The same inputs always give the same id.
- Custom looks have no permanent number.
- CLI: `captionseasy derive 12 --name "Brand Box" --set active.boxColor=#FF3366 --save custom-looks.json`, then `--looks-file custom-looks.json --look custom:brand-box-…`.

## Look metadata and multi-look videos

Every gallery look's `guide` also carries:

| field | meaning |
| --- | --- |
| `mood` | calm, warm, playful, hype, dramatic, luxe, edgy, techy, cinematic, clean, retro or dreamy |
| `formality` | casual, neutral or formal |
| `suits` | talking-head, explainer, podcast, product-ad, story |
| `scripts` | writing systems drawn natively (`latin`; `devanagari` when its fonts carry it) |
| `complexScriptSafe` | the layout keeps words whole, so Devanagari renders through a bundled fallback font. False for looks that split letters (romanize for those). |
| `pairsWith` / `avoidWith` | look numbers that work alongside it, or clash with it, in one video (hook + body + key-word stamps) |

They are derived by fixed rules from the hand-written guide cards and the measured renders.

### recommendLooks from a transcript

```ts
recommendLooks({ transcript: words, brief: "confident fintech launch", brand: "clean-corporate", platform: "linkedin" });
recommendLooks({ transcript: "नमस्ते दोस्तों ...", script: "auto" });
```

- What is said is read for pace (words/s), topic, energy cues, script (Devanagari, or romanized Hinglish) and length.
- `brand` can be a theme, or `{ colors, tone }`.
- Results also carry `mood` and `pairsWith`.
- There is no default fallback. Every result says why it ranks where it does, and a weak overall fit is called out.
- Calls without the v2 inputs return exactly what 0.1.x returned. `analyzeTranscript(words)` shows what was read.

## Several looks in one video: tracks

A hook look on the opening line, a body look for the rest, key-word / number stamps drawn over the body, a CTA look:
one props object, one theme, transitions where one look hands over to the next.

```ts
const props = buildCaptions({
  words,
  theme: "earthy-film",
  tracks: [
    { slot: "hook", look: 127, words: [0, 11] },                                   // caller word indices, end exclusive
    { slot: "body", look: 22, rest: true, transition: { type: "exit-entry", overlapMs: 80 } },
    { slot: "stamp", look: 19, role: ["number", "name"], position: "top" },        // layer 1: drawn over the body
  ],
});
// props.tracks: each look with its own doc / style / settings / transition; render with <CaptionedVideo {...props} />

const plan = planTracks({ transcript: words, brief: "warm interview", platform: "reels" }); // { theme, tracks, reasons }
buildCaptions({ words, theme: plan.theme, tracks: plan.tracks });
```

- Select words by `words: [from, to]`, `time: [fromMs, toMs]`, `role`, or `rest: true` (filters combine).
- A word belongs to one track per layer (`BAD_TRACKS` otherwise). Stamp and number slots go on layer 1 by default.
- Transitions: `cut` (default), `exit-entry` (the old look's exit, the new look's entrance, optional `overlapMs`),
  `morph` (the card travels, rescales and recolours into the next; only between word-drawn looks with the same casing,
  else exit-entry with a warning). All are pure in time. Details: [docs/composition.md](docs/composition.md#5-multi-look-tracks-several-looks-in-one-video).

## Languages and layout safety

```ts
buildCaptions({ words, look: 12, settings: { romanize: true } });   // Devanagari -> Hinglish as creators type it (pehle, karte hain)
await romanizeTranscript(words, { callback: llmFix });              // optional LLM hook, before buildCaptions
buildCaptions({ words, look: 12, settings: { hinglishSpelling: "creator" } }); // yah/kyonki/achchha -> yeh/kyunki/achha (English untouched)
lookScripts(12);                                                    // { native, fallback: { devanagari: "Mukta" }, unsupported }
buildCaptions({ words, look: 12, layout: { safeZone: "tiktok", avoid: [{ x: 0.3, y: 0.1, w: 0.4, h: 0.35, label: "face", fromMs: 0, toMs: 4000 }] } });
safeZoneTable();                                                    // per profile x platform x aspect, with sources
```

`layout` is validated (`BAD_SETTINGS`) and is applied per card at render time: each card moves to the nearest clear spot inside its look's band. When `layout` is absent, `layout` is not on the props.

## Use the props in Remotion

`captionseasy/remotion` exports the same composition the CaptionsEasy studio uses. Its peer dependencies are `react` and `remotion` (^4.0.484).

```tsx
import { Composition } from "remotion";
import { CaptionedVideo, CaptionsOverlay, calculateMetadata } from "captionseasy/remotion";

// captions only, transparent: put it on a track above your video
<Composition id="Captions" component={CaptionsOverlay} calculateMetadata={calculateMetadata}
  fps={30} width={1080} height={1920} durationInFrames={300}
  defaultProps={{ ...props, media: { width: 1080, height: 1920, fps: 30, durationMs: 10000 } }} />

// or captions burned over a video
<CaptionedVideo src={staticFile("talk.mp4")} media={{ width: 1080, height: 1920, fps: 30, durationMs: 10000 }} {...props} />
```

`CaptionsEasyCompositions` registers both compositions (`CaptionedVideo`, `CaptionsOverlay`). Fonts load from Google Fonts while rendering (free, no key).

## In any web page, no framework (`captionseasy-web`)

[`captionseasy-web`](https://www.npmjs.com/package/captionseasy-web) is a separate, opt-in package, so `captionseasy` itself stays dependency-free. It draws the same props on a `<canvas>` or as a DOM layer over a `<video>`, as a pure function of time. React and Remotion are bundled inside it, so you don't install either. It can also export transparent overlay frames (a PNG sequence or a VP9-alpha WebM) in the browser, and its output matches the server renderer within a pixel tolerance for every look.

```js
import { mountCaptions, drawCaptions, exportFrames } from "captionseasy-web";
const layer = mountCaptions(stageEl, props, { width: 1080, height: 1920 });   // DOM layer over your <video>
layer.render(video.currentTime * 1000);
await drawCaptions(ctx, props, video.currentTime * 1000, { width: 1080, height: 1920 });   // canvas
const { frames } = await exportFrames(props, { width: 1080, height: 1920, fps: 30, format: "png-sequence" });
```

## CLI

```text
captionseasy recommend ["text"] [--content <t>] [--tone <t>] [--energy 1-5] [--footage busy|bright|dark|clean]
                   [--platform <p>] [--pace slow|medium|fast] [--overlay] [--limit n]   the best looks for a video
captionseasy looks [query] [--tag <tag>] [--section <id>]   list the looks
captionseasy look <number|id>                             one look: when to use it, defaults + the controls it honours
captionseasy build --words <words.json> --look <n|id> [--set key=value ...] [--out props.json]
captionseasy themes | theme <id>                          brand themes and what each token drives
captionseasy derive <n|id> --name "X" [--set k=v] [--theme t] [--save file]   a named custom look
captionseasy safe-zones                                   platform safe zones per format
captionseasy plan --words <words.json> [--brief "..."] [--platform p] [--theme t] [--out plan.json]
                                                          several looks: hook / body / stamps / CTA
  build / <video> take --tracks plan.json instead of --look (several looks in one video)
  build / <video> also take: --theme <id|file> --roles auto --stamps[=roles] --romanize --safe-zone <p> --avoid '<json>'
  every command takes --looks-file <file> (custom looks); recommend takes --transcript --brief --brand --script
captionseasy mcp                                          MCP server on stdio
captionseasy <video> --look <n|id> [--words w.json] ...   render a video          (add-on captionseasy-render)
captionseasy transcribe <video> [--out words.json]        speech to timed words   (add-on captionseasy-transcribe)
```

| option | meaning |
| --- | --- |
| `--look, -l <n\|id>` | look number (`12`) or id (`hormozi_box`) |
| `--words <file.json>` | `[{text,startMs,endMs}]` or `{ "words": [...] }` |
| `--set key=value` | change the look, repeatable. Style keys and pacing keys (`maxWordsPerCard`, `pauseMs`, `gapBehavior` ...) both come from `captionseasy look <n>` |
| `--overlay` / `--format mov\|webm` | render transparent captions only (ProRes 4444 `.mov`, or VP9 `.webm`) |
| `--out, -o <path>` | output file |
| `--language en\|hinglish\|auto` | speech language when transcribing |
| `--json` | one JSON document on stdout. Progress goes to stderr. Errors are printed as `{"error":{"code","message","details"}}` and exit with code 1 |

## MCP server

The tools are **`recommend_looks`**, **`list_looks`**, **`describe_look`**, **`build_captions`**, **`caption_video`**, **`plan_tracks`**, **`list_themes`**, **`describe_theme`**, **`derive_look`**, **`safe_zones`** and **`transcribe`**. `build_captions` and `caption_video` also take `theme`, `roles`, `role_map`, `stamps`, `layout`, `looks_file` and `tracks` (several looks; then `look` is not needed). All take JSON and use local file paths.
- The intended flow: describe the video, `recommend_looks`, `describe_look` on the pick (its guide + controls), then `build_captions`.
- `build_captions` works with the core package alone.
- `caption_video` and `transcribe` need their add-on. Without it they return `ADDON_MISSING` with the exact install command.

To add it to Claude Code:

```bash
claude mcp add captionseasy -- npx -y captionseasy mcp
# with video rendering:
claude mcp add captionseasy -- npx -y -p captionseasy -p captionseasy-render captionseasy mcp
```

For Cursor (`~/.cursor/mcp.json`), Claude Desktop, or any client that takes the usual shape:

```json
{ "mcpServers": { "captionseasy": { "command": "npx", "args": ["-y", "captionseasy", "mcp"] } } }
```

On Windows, if your client cannot start `npx` directly, use `"command": "cmd", "args": ["/c", "npx", "-y", "captionseasy", "mcp"]`.

## Optional: rendering (`captionseasy-render`)

```bash
npm i captionseasy captionseasy-render        # ~75 MB; a headless Chrome (~100 MB) downloads on first render
npx captionseasy talk.mp4 --look 12 --words talk.words.json               # -> talk.captioned.mp4
npx captionseasy talk.mp4 --look 12 --words talk.words.json --overlay     # -> talk.captions.mov (alpha)
npx captionseasy talk.mp4 --look 12 --words talk.words.json --format png-sequence   # -> talk.captions/frame_000.png ...
# without a local install:
npx -p captionseasy -p captionseasy-render captionseasy talk.mp4 --look 12 --words talk.words.json
```

```ts
import { render } from "captionseasy";   // loads captionseasy-render on demand
await render({ video: "talk.mp4", words, look: 12, mode: "overlay", overlayFormat: "webm", out: "captions.webm" });
// { out, mode, durationMs, width, height, fps, look, words, renderMs, warnings }
```

- **Burn mode** writes an H.264 MP4 with the original audio.
- **Overlay mode** writes ProRes 4444 `.mov` or VP9 `.webm`, both with an alpha channel, at the video's size and length.
  - With `captionseasy-render` 0.2+, `overlayFormat: "png-sequence"` writes a folder of transparent PNGs instead (`frame_000.png` ...). The result's `pattern` gives the ffmpeg input pattern.
- Themes, tracks, word roles, stamps, layout safety and `png-sequence` need `captionseasy-render` 0.2+. An older add-on is refused with `ADDON_MISSING` and the upgrade command (`npm i captionseasy-render@^0.2.0`), instead of silently ignoring the option.
- The add-on ships the composition pre-bundled, so no webpack runs on your machine. It uses the ffmpeg that comes with Remotion.

## Optional: transcription (`captionseasy-transcribe`)

No word timings yet? This add-on runs Whisper locally, using `whisper-base` with word timestamps through transformers.js on onnxruntime-node.
- onnxruntime-node ships prebuilt binaries, so nothing is compiled.
- The add-on is about 540 MB installed, plus a speech model downloaded once into your user cache (about 200 MB for English, about 77 MB for Hinglish).

```bash
npm i captionseasy captionseasy-transcribe
npx captionseasy transcribe talk.mp4 --out talk.words.json       # [{ text, startMs, endMs }]
```

With both add-ons installed, `captionseasy talk.mp4 --look 12` transcribes and renders in one step.

## JSON shapes

```jsonc
// describe_look / captionseasy look 12 --json (trimmed)
{ "number": 12, "id": "hormozi_box", "name": "Jumping Box", "section": "popular", "layout": "sentence", "wordsPerCard": 3,
  "defaults": { "fontSize": 58, "active.boxColor": "#22C55E", "position.y": 0.72 },
  "controls": [
    { "key": "fontSize", "label": "Size", "type": "number", "min": 24, "max": 140, "step": 1, "default": 58 },
    { "key": "active.effect", "label": "Spoken-word effect", "type": "enum", "options": ["none", "color", "box"], "default": "box" },
    { "key": "stroke.width", "label": "Outline width", "type": "number", "min": 1, "max": 16, "default": 3, "dependsOn": "stroke.enabled=true" }
  ],
  "settings": [{ "key": "maxWordsPerCard", "type": "number", "min": 1, "max": 12, "default": 3 }] }

// build_captions / buildCaptions
{ "doc": { "version": 2, "language": "en", "words": [{ "id": "a1b2c3d4e5f6", "text": "Stop", "startMs": 380, "endMs": 840 }] },
  "style": { "templateId": "boxed_word", "fontId": "Montserrat", "...": "every field filled in" },
  "settings": { "maxWordsPerCard": 3, "pauseMs": 400, "...": "..." },
  "look": { "number": 12, "id": "hormozi_box", "name": "Jumping Box" }, "warnings": [] }

// any error
{ "error": { "code": "BAD_OVERRIDE", "message": "Unknown style key \"wobble\". Jumping Box (#12) accepts: fontId, fontSize, ...", "details": { "validKeys": ["fontId", "..."] } } }
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Every entry states whether existing look output changed. The only change so far is a documented bug fix to #126 in 0.2.0 (long lines ran off the frame). This is checked by per-look render hashes and the 0.1.x API guard. A gallery of every look under every theme: `node packages/web/gallery/generate.mjs` in the repo.

## Licences

- captionseasy: MIT (see LICENSE).
- Rendering uses [Remotion](https://www.remotion.dev). Remotion is free for individuals and for companies of up to 3 people; larger companies need a [Remotion company licence](https://www.remotion.dev/license). This applies whether you render with `captionseasy-render` or render the components in your own Remotion project.
- Speech models (transcribe add-on): OpenAI Whisper (MIT), via `onnx-community/whisper-base_timestamped`. The Hinglish model is `ishaan-g/whisper-hinglish-swift_timestamped`.
- Fonts: Google Fonts (open licences).
