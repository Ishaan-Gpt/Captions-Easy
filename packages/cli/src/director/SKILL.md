---
name: caption-director
description: Direct the captions for a short-form video with CaptionsEasy. Given timed words (and optionally word roles, the video's mood and where the faces are), choose one look, the key words, the words per card and the position, and get validated buildCaptions arguments with every taste rule checked. Use when an editor (Edit Easy, a Remotion pipeline, an agent) needs captions that look directed rather than default — for Shorts, Reels or TikTok.
---

# Caption director

`directCaptions()` (in `captionseasy`) decides how a video's captions look. It works by rules: it picks one look, the
key words, the words per card and the position, then returns `buildCaptions` arguments plus a check of every taste
rule. A model only adds meaning: which words matter, and the mood. It never chooses colours, timings, sizes or
positions.

## When to use it

- You have timed words (`[{ text, startMs, endMs }]`) and want captions that follow the house taste without
  hand-picking a look or settings.
- An editor such as Edit Easy builds captions automatically, for a whole video or a clip.
- Skip it when the user has already chosen a look and settings themselves. Call `buildCaptions` directly then. A
  pinned `look` still gets the director's key words, card size and position if you want them.

## How

```js
import { directCaptions, buildCaptions } from "captionseasy";

const plan = directCaptions({
  words,                       // [{ text, startMs, endMs, role? }]; a role you set wins
  mood: "calm",                // optional: the video's mood
  content: "business-advice",  // optional, as recommendLooks
  platform: "shorts",          // shorts (default) | reels | tiktok | youtube | linkedin
  energy: 3,                   // optional, 1 calm ... 5 hype
  faces: [{ x: 0.3, y: 0.18, w: 0.4, h: 0.3 }], // optional: frame fractions, optionally fromMs/toMs
  meaning,                     // optional: a model's JSON reading, see below
});
plan.checks;                   // every taste rule: { rule, ok, detail }
const props = buildCaptions(plan.args); // validated; pass the props to CaptionedVideo / captionseasy-web
```

`plan` also returns `look`, `keyWords`, `wordsPerCard`, `position` (with the band it chose), `reasons` (one line per
decision) and `warnings`.

### What a model may fill

At most this, as JSON, checked by `parseMeaning`:

```json
{ "mood": "hype", "keyWords": [0, 2, 5] }
```

- `keyWords` are indices into `words`.
- Any other key is refused with an error: a colour, a time, a position, a size, a look or a theme.
- A connector (the, and, of) the model marks as key is ignored.
- The director still keeps no more than one key word a card.

Prompt the model with the numbered words and ask only: "Which words carry the meaning? What is the mood, in a word?"

### How it decides

1. **Look.** It asks `recommendLooks` for the words, mood, content and platform. It takes the best-ranked look that
   can draw key words differently (`describeLook(n).roles.levers.emphasis`) and has at most 4 words a card. A pinned
   `look` wins.
2. **Words per card.** Set by the pace:
   - 3.3 or more words a second: 2
   - 2.4 or more: 3
   - slower: 4
   - hype (energy 5 or mood "hype"): at most 2

   One-word looks use 1. Looks composed for a fixed count keep it, capped at 4.
3. **Key words.** Taken in this order: the caller's roles, then the model's `keyWords`, then rules (numbers, names,
   strong content words). At most one a card, and at most 20% of all words. In a one-word look, at most one card in
   three. The words are passed as explicit roles, and the look draws them as its key word.
4. **Position.** With no faces given, the look's own place. Every look is calibrated to the lower band (y 1060-1480
   at 1080x1920): under a talking head's face, above the platform UI.
   - A face in the lower band moves the captions to the upper band (y 230-560).
   - A face in both bands keeps the lower band, and the faces go to `layout.avoid`, so the renderer moves or shrinks
     a card around them.
   - The platform's safe zone is always passed in `layout.safeZone`.

## Taste rules

They are numbers in `CAPTION_RULES` (`packages/templates/src/rules.ts`), at 1080 x 1920:

| rule | value | why |
| --- | --- | --- |
| text never covers a face | lower band 1060-1480, upper band 230-560, faces avoided | the face is the video |
| Shorts safe area | x 70-905, y 230-1480 | the platform UI (title, buttons, progress bar) covers the rest |
| text size | any word >= 46 px (hard floor 26 px); the lead word 72-170 px | readable at phone size, never a wall of type |
| key-word size jump | largest / smallest word on screen <= 3x | above that a card reads as one word plus noise |
| words a card | at most 4 | a cue is read in one glance |
| emphasis | key words only: at most one a card and 20% of the words, never every word | emphasis on everything is emphasis on nothing |

### How the library keeps to them

Every look in the library keeps to these rules: font size, line width, position and key-word scale are calibrated per
look, and the look's design is not changed.

- `packages/web/scripts/calibrate.mjs` measures each look live at 1080x1920 on two transcripts and writes the smallest
  fix to `packages/templates/src/looks/rules.generated.json`.
- `packages/web/scripts/audit.mjs` re-measures every look and fails on any rule broken.

## How it is judged

- **The checks.** `plan.checks` must all be `ok`.
- **Tests.** `packages/cli/test/director.test.ts` runs the director on three sample transcripts
  (`test/__fixtures__/director-samples.json`: business advice, a fitness hype hook, a luxury ad with the face low in
  frame). For each one it checks:
  - every taste rule holds
  - the arguments build
  - at least one key word, and fewer than half the words
  - the result is deterministic

  Further tests cover the face move to the upper band, the caller's roles winning, the per-card budget, and the
  model being refused anything but meaning.
- **By eye.** `node packages/cli/scripts/director-samples.mjs` writes the decisions with their reasons
  (`packages/cli/docs/director-samples.md`). Read it against these questions:
  - Is the look right for the mood?
  - Are the key words the ones a person would stress?
  - Does the text stay off the face?
- **The library.** `node packages/web/scripts/audit.mjs` must report 0 looks breaking a rule, and
  `node packages/web/scripts/stills.mjs --out <dir>` renders contact sheets with the safe area outlined.
