# Composition: word roles, themes, custom looks, look metadata (captionseasy 0.2.0)

Design note for the 0.2.0 composition features. Rule zero, everywhere: **nothing changes unless the caller opts in.**
Every published look keeps rendering byte-identical output (guarded by `packages/templates/src/compat.test.tsx`),
and every 0.1.x call keeps its exact result (guarded by `packages/cli/test/compat.test.ts`).

## 1. Word roles

`Word.role` (shared schema, optional): `connector | key | title | number | name | emphasis`.

Assignment (`assignRoles` in `@motion-ai/caption-engine/core`, deterministic, no model):

| role | auto rule (first match wins; explicit roles always win) |
| --- | --- |
| number | has a digit, currency or %, or is a number word (one..ten, hundred, thousand, million, lakh, crore, ek/do/teen ...) |
| title | inside quotes ("...", “...”) |
| emphasis | ALL CAPS (4+ letters), or ends in "!" (3+ letters), or `emphasis: "strong"` |
| name | Capitalised mid-sentence (not "I"), or a 2-3 letter acronym |
| connector | function word (English + romanized Hindi list shared with the hero picker) |
| key | the card's key word (the hero picker on char-measured cards), when not already one of the above |
| (none) | everything else: body text, rendered exactly as the look renders it |

Rendering. Roles are compiled by `buildCaptions` into **per-word levers** that the templates already honour
(or now honour, only when the field is present):

| lever | word field | honoured by |
| --- | --- | --- |
| key style | `emphasis: "hero"` | 71 looks (key-word drawing, kit keyIndex, hero picker) |
| colour | `color` | 74 looks: core layouts + lines/plates/premium/paper packs |
| size | `scale` (new, optional) | 30 looks: core layouts (WordSpan, one-word layout) |
| entry | `entry: "pop" \| "slam" \| "rise"` (new, optional) | 30 looks: core layouts (WordSpan, one-word layout) |
| visibility | `hidden: true` | every look (keyword-only stamps) |

Which lever a look really honours is **measured**, not declared: `templates/src/looks/capabilities.generated.json` is
written by `capabilities.test.tsx`, which renders each look with and without the lever and checks the markup
changes (and fails if the table drifts). A look's role map only uses levers it honours, so `describeLook(...).roles`
never promises something the look ignores.

A role map entry: `{ size: xs|s|m|l|xl, color: inherit|ink|paper|accent|accent2|deep|pop, entry: none|pop|slam|rise, asKey: boolean, show: boolean }`.
Default map: connector `s`; key `l` + asKey; number `l` + accent2 + asKey + pop entry; name accent2;
title `l` + pop colour; emphasis asKey + pop entry. 32 composed lockups honour no lever: roles only work there as stamps
(buildCaptions warns). Key words are picked per 3+-word phrase, so one-word looks do not make every word a key. Callers override any of it with `roleMap`.
Colour roles resolve from the theme's palette, or (no theme) from the look's own colours (ink = text fill,
accent = highlight/box, accent2 = hero/glow/secondary, deep = outline, paper = plate).

Opt-in: `buildCaptions({ roles: "auto" | "explicit" | (WordRole|null)[] | Record<index, WordRole>, roleMap?, stamps? })`.
`stamps: true | WordRole[]` = keyword-only stamps: words whose role is not listed (default `key`, `number`) are hidden.
Roles are stored on the doc words, so later phases (tracks) can route words by role.

## 2. Themes

Tokens: `palette { ink, paper, accent, accent2, deep, pop }` (hex), `fonts { display, text, accent }` (bundled
fonts), `motion { intensity (x look's own, 0.4..1.6), easing look|smooth|snappy|gentle|linear, entrySpeed
(x look's own, 0.5..2), stagger look|none|word|char }`.

Palette semantics: ink = caption text over video; paper = plate/box/card; deep = dark tone (outlines, text on a
light plate); accent = key word / highlight; accent2 = second accent (numbers, names, gradient end); pop = rare third.

Mapping (only controls the look honours **without** switching something on: visible, no `dependsOn`):

| control | token |
| --- | --- |
| fill.color | light text -> ink, dark text -> deep; colourful gradient -> accent (start) + accent2 (end); neutral "material" gradients kept |
| active.color | accent; on a box effect: readable of ink/deep on the accent box |
| active.boxColor | accent |
| stroke.color | dark -> deep, light -> ink, colourful -> accent2 |
| glow.color | colourful -> accent, neutral -> ink |
| background.color | light plate -> paper, dark plate -> deep |
| fontId | heavy/caps looks -> display, others -> text |
| hero.fontId | accent |
| motionIntensity | x intensity |
| entrance.durationMs / exit.durationMs | / entrySpeed |
| entrance.easing / entrance.stagger | family / stagger (unless "look") |

Polarity is kept (dark-on-plate looks stay dark-on-plate) and a contrast pass picks the more readable palette
colour for text sitting on a themed plate. Caller `overrides` always win over the theme. Ten named themes ship
(`listThemes()`); custom themes are validated (`BAD_THEME`).

## 3. Custom looks

`deriveLook(base, overrides, { name, theme?, settings? })` validates against the base's controls (same errors as
`buildCaptions`) and returns plain JSON: `{ kind: "custom", id: "custom:<slug>-<hash>", name, baseNumber, baseId,
overrides, theme?, settings?, changed: [{ key, from, to }] }` with no `number`. The id hashes base + overrides +
theme + settings, so it is stable. `registerLook(json)` adds it to the in-process registry (no disk state);
`listLooks({ includeCustom: true })`, `describeLook(custom)`, `buildCaptions({ look: custom | id })` accept it.
CLI: `--looks-file custom-looks.json` (loaded on start), `captionseasy derive <base> --name ... --set ... [--save file]`.
MCP: `derive_look`, `list_themes`, `describe_theme`.

## 4. Look metadata + recommendLooks v2

Each guide card gains `mood`, `formality`, `suits` (talking-head | explainer | podcast | product-ad | story),
`scripts` (agent C's `lookScriptSupport` native scripts, only when the layout keeps words whole),
`complexScriptSafe` (the template does not split code points AND the measured renders keep each word whole: Devanagari
renders through the bundled fallback font), `pairsWith` and
`avoidWith` (look numbers for multi-look tracks: hook + body + stamp).
mood/formality/suits are derived from the hand-written card by fixed rules (in `meta.ts`); pairs are chosen by
rules (complementary slot, shared tone/mood, same formality, compatible footage, different template).

`recommendLooks` v2 adds `{ transcript, brief, brand, script }`. The transcript is analysed (pace in words/s,
content keywords, energy cues, script, length); brand = theme id/object or `{ colors, tone }`. v1 inputs give
exactly the 0.1.x result; there is never a "default" fallback: weak fits are still ranked and say so.

recommendLooks v2 script scoring: native Devanagari +8, fallback font -2, letter-splitting look -40 (romanize instead).

Theme fonts never make a look lighter (0.2.0 fix): a look's face is swapped for the theme face only when the theme face
has a weight that draws at least about as heavy (`visualWeight`, within 100) and that weight is set; when the look does
not honour `fontWeight`, its own weight must already be available. Single-weight heavy display faces (Anton, Bebas Neue,
Luckiest Guy ...) are heavy by design and always keep their own character, e.g. Orange Stamp Word's (#26) Anton key word.

recommendLooks v2 reads a transcript as Hinglish only from romanized Hindi words that are not also English
(`hinglishEvidence` in caption-engine: "to", "so", "me", "the", "main", "hi" count for neither side): at least two
distinct Hindi words, at least 15% of the words, and at least half as many Hindi as clear English words.

## 5. Multi-look tracks (several looks in one video)

`buildCaptions({ words, theme?, tracks: TrackPlan[] })` (instead of `look`). Without `tracks` nothing below runs and
the result is the single-look result, unchanged.

### Track plan (input)

```ts
{
  name?: string,                       // unique; default the slot ("hook"), else "track<i>"
  slot?: "hook" | "body" | "stamp" | "number" | "list" | "cta",
  look: number | string | CustomLook,  // any look ref, per track
  // which words: at least one; several combine as AND
  words?: [from, to] | { from, to? },  // caller word indices, to exclusive
  time?: [fromMs, toMs] | { fromMs?, toMs? },   // words whose middle falls in the span
  role?: WordRole | WordRole[],        // roles are assigned automatically (or from buildCaptions `roles`)
  rest?: true,                         // every word of this layer no other track takes (one per layer)
  layer?: 0..9,                        // default 0; stamp / number slots default to 1 (drawn above the body)
  position?: "top" | "upper" | "middle" | "lower" | "bottom" | { x?, y },  // .2 / .32 / .5 / .68 / .8
  overrides?, settings?, roleMap?,     // per track, validated against that track's look
  transition?: "cut" | "exit-entry" | "morph" | { type, durationMs?, overlapMs? },  // how it takes over
  exit?: "fade" | "fall" | "zoom-out" | "blur-out" | "slide-up",  // when the look has no exit of its own
}
```

Rules: one theme for every track (`theme`, else each custom look's own). Global `settings` (romanize, hinglishSpelling,
pacing) apply to every track, then the track's own. Stamp / number slots default to one word per card and
`gapBehavior: "clear"` (only where the look offers those settings). Global `overrides` and `stamps` are rejected with
tracks (put them on a track). A word may belong to one track **per layer**: overlaps are `BAD_TRACKS` naming the words
and tracks. Base-layer words in no track are a warning. Bad ranges, spans, roles, slots, layers, transitions, exits and
positions are `BAD_TRACKS` with what is allowed.

### Props (output, the contract with the composition and captionseasy/web)

`CaptionsProps` gains `tracks?: CaptionsTrack[]`; `doc` then holds every word (ids shared with the tracks) and
`style` / `settings` / `look` are the main track's (base layer, most words), so a renderer that ignores tracks still
shows something sensible. Each track:

```ts
{ id, name, slot?, layer, look: { number, id, name, custom?, baseNumber? }, startMs, endMs,
  doc: CaptionDoc,                      // this track's words only (role levers compiled for its look when roles are on)
  style: CaptionStyle, settings: ProjectSettings,
  transition: { type: "cut" | "exit-entry" | "morph", durationMs, overlapMs },
  exit: { type, native },               // native = the look's own exit; else a whole-card envelope of that kind
  theme?: { id, name, applied }, roles?: { counts, levers } }
```

The composition (`CaptionedVideoProps.tracks`, zod `CaptionTrackSchema`, default `null`) renders tracks when the array
is non-empty: each track is paginated with its own look, settings and fonts, `layout` safety applies per track, then
the hand-overs of each layer are planned (`compositions/src/tracks.ts`, pure). Layers draw in DOM order (no z-index). Then
higher layers are kept clear of lower ones (`separateLayers`): a stamp card whose measured box (`measureCardBox`) would
overlap a lower-layer card on screen at the same time moves with `solvePlacement` (agent C's solver; the active
lower-layer boxes are avoid boxes, the safe zone applies): first above the lower cards inside the stamp look's band,
then anywhere in that band, shrinking as a last resort. Lower layers never move; nothing changes without tracks.

### Transitions (at a hand-over T = the first card of the incoming track, on the same layer)

| type | what plays |
| --- | --- |
| cut (default) | the outgoing card holds through a short silence (<= 1.5 s, when its look holds) and is replaced at T |
| exit-entry | the outgoing card exits over `durationMs` (default 260), ending at T + `overlapMs` (default 0); the incoming look plays its own entrance from T. A look whose layout honours exits (`exit.type` control, not "none") plays its own exit stretched to `durationMs`; any other gets a whole-card envelope (`exit`, default blur-out). The exit takes at most 60% of a short card. |
| morph | both cards travel the same path (outgoing centre -> incoming centre), scale between the two type sizes and cross-dissolve over `durationMs` (default 420); the text colour interpolates when both fills are solid; the incoming card skips its entrance. |

Morph-compatible set: both looks draw words as plain resizable text (measured `lookCapabilities` levers `size` and
`color`, the word-drawn core layouts) **and** use the same casing. Anything else falls back to exit-entry (<= 320 ms)
with a warning; a morph across a long silence plays as exit-entry too (nothing to travel from).
All effects are pure functions of media time (`fxAt`). Web exporter caveats: CSS `filter: blur` may be ignored by the
in-browser exporter (blur-out degrades to its fade + scale), and layers rely on DOM order.

### planTracks (proposal)

`planTracks({ transcript, brief?, platform?, theme?, mode? })` -> `{ theme, tracks, looks, reasons }`, deterministic:
body = the best `recommendLooks` look that can carry a body; hook / stamp looks from the body's `pairsWith` (else the
next best look for the slot; stamp layers never use looks made from the video picture); hook = the first sentence
(<= 16 words) or the opening up to the longest pause; CTA = the last sentence in the second half with a call to action
(follow, subscribe, like karo ...) in the hook look; stamps = number / emphasis / name words (else key words) over the
body; hook -> body morphs when compatible, else exit-entry; theme = the caller's, else the named theme matching the
body look's mood and script. CLI `captionseasy plan --words w.json --out plan.json`, MCP `plan_tracks`.
