/**
 * Public types of the `captionseasy` package. Self-contained on purpose (no imports), so the published typings never
 * point at the private workspace packages they are bundled from.
 */

/** Which speech model transcribes: English, Hinglish (Hindi/English written in Roman letters) or auto-detect. */
export type Language = "en" | "hinglish" | "auto";

/** One spoken word with its timing on the video's clock (milliseconds). */
export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
  /** optional word role, honoured when buildCaptions is called with `roles` (see WordRole) */
  role?: WordRole;
}

export interface Transcript {
  /** "en", "hi-Latn" (Hinglish) or "auto" */
  language: string;
  /** speech model id@revision that wrote the words */
  model: string;
  durationMs: number;
  /** wall-clock time the transcription took */
  elapsedMs: number;
  words: TranscriptWord[];
}

export interface TranscribeOptions {
  /** default "en" */
  language?: Language;
  /** 0..1 while the speech windows are transcribed */
  onProgress?: (fraction: number) => void;
  /** no model-download progress on stderr */
  quiet?: boolean;
}

/** A look: a complete, designed caption style. Refer to it by `number` (permanent) or `id`. */
export interface LookSummary {
  number: number;
  id: string;
  name: string;
  /** gallery section ("viral", "popular", "premium" ...) */
  section: string;
  tags: string[];
  description: string;
  /** "word" (one word at a time), "sentence", "karaoke" ... */
  layout: string;
  /** words shown per caption card by default */
  wordsPerCard: number;
  /** compact "when to use" card (absent only for retired looks) */
  guide?: LookGuideBrief;
}

// ---------------------------------------------------------------- choosing a look ("when to use" guide)

/** Content types a look suits (fixed vocabulary, see CONTENT_TYPES). */
export type ContentType =
  | "talking-head"
  | "podcast-clip"
  | "business-advice"
  | "motivational"
  | "educational"
  | "storytime"
  | "comedy-meme"
  | "gaming"
  | "fitness"
  | "beauty-lifestyle"
  | "fashion-luxury"
  | "product-ad"
  | "news-explainer"
  | "music-lyrics"
  | "travel-vlog"
  | "cinematic-trailer"
  | "real-estate"
  | "tech-ai";

/** Visual tone (fixed vocabulary, see TONES). */
export type Tone = "bold" | "playful" | "elegant" | "premium" | "minimal" | "edgy" | "cinematic" | "friendly" | "techy" | "retro" | "dramatic" | "clean";

export type Platform = "tiktok" | "reels" | "shorts" | "youtube" | "linkedin";

/** How fast the speaker talks. */
export type Pace = "slow" | "medium" | "fast";

/** What the footage behind the captions is like. "clean" = simple, uncluttered background. */
export type FootageKind = "busy" | "bright" | "dark" | "clean";

/** Readability of a look over different footage. */
export interface LookFootage {
  /** stays readable over cluttered, high-detail footage (box, plate, outline or heavy halo) */
  worksOnBusy: boolean;
  /** stays readable over bright / white footage */
  worksOnBright: boolean;
  /** stays readable over dark footage */
  worksOnDark: boolean;
  /** the design is made of the video itself (difference blend, knockout): burn-in only, useless as a transparent overlay */
  needsVideoBehind: boolean;
}

/** The look-tiers rating (docs/research/look-tiers.md): goated (top), mid, or low (near-duplicate / dated). */
export interface LookQuality {
  tier: "goated" | "mid" | "low";
  /** out of 10 */
  score: number;
}

/** Overall feel of a look (fixed vocabulary, see MOODS). */
export type LookMood = "calm" | "warm" | "playful" | "hype" | "dramatic" | "luxe" | "edgy" | "techy" | "cinematic" | "clean" | "retro" | "dreamy";
export type Formality = "casual" | "neutral" | "formal";
/** Broad video formats a look suits (fixed vocabulary, see SUITS). */
export type Suit = "talking-head" | "explainer" | "podcast" | "product-ad" | "story";
/** Writing systems. "latin" covers English and romanized Hinglish; "devanagari" is Hindi script. */
export type Script = "latin" | "devanagari";

/** The compact guide that `listLooks` carries. */
export interface LookGuideBrief {
  /** what it looks like and how it feels (<= 120 chars) */
  summary: string;
  /** 1 calm/elegant ... 5 hype/punchy */
  energy: 1 | 2 | 3 | 4 | 5;
  tone: Tone[];
  bestFor: ContentType[];
}

/** "When to use" card for one look. */
export interface LookGuide extends LookGuideBrief {
  avoidFor: ContentType[];
  footage: LookFootage;
  /** speaker paces it suits */
  pace: Pace[];
  /** words per caption card by default (from the look) */
  wordsPerCard: number;
  platforms: Platform[];
  /** tier rating, when the look has been rated */
  quality?: LookQuality;
  /** practical advice: when to choose it, overrides worth changing, pitfalls */
  usage: string;
  /** overall feel */
  mood: LookMood;
  formality: Formality;
  /** broad formats it suits */
  suits: Suit[];
  /** writing systems it renders natively (its own fonts have the glyphs and its layout keeps words whole) */
  scripts: Script[];
  /** the layout keeps every word whole, so a complex script renders correctly once a font that has it is swapped in */
  complexScriptSafe: boolean;
  /** look numbers that work alongside it in one video (hook + body + key-word stamps), best first */
  pairsWith: number[];
  /** look numbers that clash with it in one video */
  avoidWith: number[];
}

export interface RecommendLooksOptions {
  /** what the video is (one or more of CONTENT_TYPES; common synonyms like "podcast", "tutorial", "gym" are understood) */
  content?: string | string[];
  /** wanted tone(s) (TONES, or moods like "calm", "luxury", "hype", "fun") */
  tone?: string | string[];
  /** alias of tone */
  mood?: string | string[];
  /** 1 calm ... 5 hype */
  energy?: number;
  /** what the footage behind the captions is like */
  footage?: FootageKind;
  platform?: Platform | string;
  /** speaker pace */
  pace?: Pace;
  /** "overlay" (transparent captions) never returns looks that need the video behind them */
  mode?: "burn" | "overlay";
  /** how many to return (default 5) */
  limit?: number;
  /** free-text description of the video, e.g. "calm luxury perfume ad, clean footage" */
  query?: string;
  // ---- v2 (0.2.0): any of these switches on transcript/brand-aware ranking
  /** what is said: timed words, a Transcript, or plain text. Pace, topic, energy cues, script and length are read from it */
  transcript?: TranscriptWord[] | { words: TranscriptWord[]; language?: string } | string;
  /** free-text creative brief ("launch film for a fintech app, confident, premium"); parsed like `query` */
  brief?: string;
  /** brand: a theme (id or object), or its colours/tone */
  brand?: ThemeRef | { theme?: ThemeRef; colors?: string[]; tone?: string | string[] };
  /** writing system the captions are in; "auto" reads it from the transcript */
  script?: Script | "auto";
}

export interface LookRecommendation {
  number: number;
  id: string;
  name: string;
  /** higher is better; only meaningful relative to the other results */
  score: number;
  /** why it scored the way it did */
  reasons: string[];
  summary: string;
  usage: string;
  /** v2 only: the look's mood */
  mood?: LookMood;
  /** v2 only: looks that pair with it in a multi-look video */
  pairsWith?: number[];
}

/** What recommendLooks reads from a transcript. */
export interface TranscriptAnalysis {
  words: number;
  /** speech span, when the words are timed */
  durationMs?: number;
  wordsPerSecond?: number;
  pace?: Pace;
  script: Script;
  /** romanized Hindi function words make up a good share of the words */
  hinglish: boolean;
  content: ContentType[];
  energy?: number;
  /** share of words that are figures */
  numberShare: number;
  notes: string[];
}

export type ControlType = "number" | "color" | "boolean" | "enum" | "font";

/** One thing you may change about a look, addressed by `key` (a dot path into the style). */
export interface LookControl {
  key: string;
  label: string;
  type: ControlType;
  min?: number;
  max?: number;
  step?: number;
  /** allowed values for "enum" (and the bundled fonts for "font") */
  options?: (string | number)[];
  /** the look's own value */
  default: unknown;
  /** this control only takes effect once another key has this value ("stroke.enabled=true"); setting it turns that on */
  dependsOn?: string;
  description?: string;
}

/** Caption pacing/timing keys (shared by every look). */
export interface SettingControl {
  key: string;
  label: string;
  type: ControlType;
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  default: unknown;
  description?: string;
}

export interface LookDetails extends LookSummary {
  retired: boolean;
  /** the look's style values that its controls read (a flat dot-path map) */
  defaults: Record<string, unknown>;
  /** ONLY the style controls this look's template really responds to */
  controls: LookControl[];
  /** caption pacing (words per card, timing) */
  settings: SettingControl[];
  /** the full "when to use" card (absent only for retired looks) */
  guide?: LookGuide;
  /** which word-role effects this look really shows (measured from its renders) and its role map */
  roles: RoleSupport;
  /** set when described with a theme: what the theme changed */
  theme?: ThemeApplication;
}

export interface DescribeLookOptions {
  /** describe the look as it renders under this theme (defaults show the themed values) */
  theme?: ThemeRef;
}

export interface ListLooksOptions {
  /** free text matched against number, id, name, description, tags, section and layout (every word must match) */
  query?: string;
  /** every tag must match (case-insensitive substring) */
  tags?: string[];
  /** a gallery section id ("viral", "popular", "premium", "simple" ...) */
  section?: string;
  /** also list the custom looks registered in this process (registerLook / --looks-file), after the gallery */
  includeCustom?: boolean;
}

/** A look number (118, "118", "#118") or id ("chrome_sweep"). */
export type LookRef = number | string;

/** Style overrides: flat dot paths (`{"active.color": "#FF0000"}`) or nested objects; validated against the look. */
export type StyleOverrides = Record<string, unknown>;

/** Caption pacing overrides, e.g. `{ maxWordsPerCard: 2, gapBehavior: "clear" }`. */
export type SettingsOverrides = Record<string, unknown>;

export interface BuildCaptionsInput {
  words: TranscriptWord[];
  /**
   * a look number/id, a registered custom look id ("custom:..."), or a custom look object from deriveLook.
   * Required unless `tracks` is given (then each track names its own look).
   */
  look?: LookRef | CustomLook;
  overrides?: StyleOverrides;
  settings?: SettingsOverrides;
  /** language tag stored in the caption doc (default "en") */
  language?: string;
  /** apply a theme (id or object) to the look's honoured controls; `overrides` still win */
  theme?: ThemeRef;
  /**
   * Opt in to word roles: "auto" (rules fill every word; words[].role wins), "explicit" (only words[].role),
   * an array of roles aligned with `words`, or a map { wordIndex: role }. Absent = no roles (today's output).
   */
  roles?: RolesInput;
  /** change how roles render (merged over the look's role map) */
  roleMap?: RoleMap;
  /** keyword-only stamps: show only words with these roles (true = key + number). Needs `roles`. */
  stamps?: boolean | WordRole[];
  /** layout safety: platform safe zone and/or avoid boxes over time (applied per card at render time) */
  layout?: LayoutSafety;
  /**
   * Several looks in one video: a track plan. Each track takes some of the words (index range, time span, role, or
   * the rest) and a look; one theme applies to all of them; transitions play where one look hands over to the next on
   * the same layer. Higher layers draw above (stamps over the body). Absent = one look for every word (today's result).
   */
  tracks?: TrackPlan[];
}

// ---------------------------------------------------------------- multi-look tracks

/** What a track is for (sets defaults: stamp / number tracks go on layer 1, one word per card). */
export type TrackSlot = "hook" | "body" | "stamp" | "number" | "list" | "cta";
/** A vertical band (top .2, upper .32, middle .5, lower .68, bottom .8) or an explicit centre (frame fractions). */
export type TrackPosition = "top" | "upper" | "middle" | "lower" | "bottom" | { x?: number; y: number };
export type TrackTransitionType = "cut" | "exit-entry" | "morph";
/**
 * How a track takes over from the previous track on its layer. cut (default): the old card holds until the new one
 * starts. exit-entry: the old look plays its exit (ending overlapMs after the new card starts), the new look plays its
 * own entrance. morph: the card travels, rescales and recolours into the next one (compatible looks only, else
 * exit-entry with a warning).
 */
export type TrackTransitionInput = TrackTransitionType | { type: TrackTransitionType; durationMs?: number; overlapMs?: number };
export interface TrackPlan {
  /** unique name (default: the slot, else "track<i>") */
  name?: string;
  slot?: TrackSlot;
  look: LookRef | CustomLook;
  // ---- which words (combine as AND; at least one)
  /** caller word indices [from, to) (to exclusive), or { from, to? } */
  words?: [number, number] | { from: number; to?: number };
  /** a time span in ms: words whose middle falls in [fromMs, toMs) */
  time?: [number, number] | { fromMs?: number; toMs?: number };
  /** words with these roles (roles are assigned automatically unless buildCaptions `roles` says otherwise) */
  role?: WordRole | WordRole[];
  /** every word of this layer that no other track takes (one rest track per layer) */
  rest?: boolean;
  // ---- how
  /** drawing layer, default 0 (stamp/number slots: 1). A word may belong to one track per layer */
  layer?: number;
  overrides?: StyleOverrides;
  settings?: SettingsOverrides;
  /** where this track sits (sets position.y / position.x) */
  position?: TrackPosition;
  /** role rendering for this track (with buildCaptions `roles`) */
  roleMap?: RoleMap;
  /** how this track takes over from the previous track on its layer */
  transition?: TrackTransitionInput;
  /** exit used at a hand-over when this look has no exit of its own (default "blur-out") */
  exit?: "fade" | "fall" | "zoom-out" | "blur-out" | "slide-up";
}
/** One resolved track inside CaptionsProps.tracks. */
export interface CaptionsTrack {
  id: string;
  name: string;
  slot?: TrackSlot;
  layer: number;
  look: CaptionsProps["look"];
  /** first word start / last word end */
  startMs: number;
  endMs: number;
  doc: CaptionsProps["doc"];
  style: CaptionsProps["style"];
  settings: CaptionsProps["settings"];
  transition: { type: TrackTransitionType; durationMs: number; overlapMs: number };
  /** how this track leaves at a hand-over: its look's own exit (native) or a whole-card envelope */
  exit: { type: string; native: boolean };
  theme?: { id: string; name: string; applied: string[] };
  roles?: { counts: Partial<Record<WordRole, number>>; levers: RoleLevers };
}

export interface PlanTracksOptions {
  /** what is said: timed words or a Transcript */
  transcript: TranscriptWord[] | { words: TranscriptWord[]; language?: string };
  /** creative brief, read like recommendLooks' brief */
  brief?: string;
  platform?: Platform | string;
  /** the brand theme every track will share (default: the named theme matching the body look's mood) */
  theme?: ThemeRef;
  mode?: "burn" | "overlay";
}
export interface PlanTracksResult {
  /** a theme id, or the caller's theme id */
  theme: string;
  /** ready for buildCaptions({ words, theme, tracks }) */
  tracks: TrackPlan[];
  looks: { track: string; number: number; id: string; name: string }[];
  /** why each track, look and transition was chosen */
  reasons: string[];
}

/** Validated input for the CaptionedVideo composition (plus what was chosen). */
export interface CaptionsProps {
  /** CaptionDoc v2: words with ids */
  doc: Record<string, unknown> & { version: 2; words: (TranscriptWord & { id: string })[] };
  /** full CaptionStyle (every field filled in) */
  style: Record<string, unknown> & { templateId: string };
  /** full ProjectSettings */
  settings: Record<string, unknown> & { maxWordsPerCard: number };
  /** for a custom look: number = its base look's number, id = "custom:...", plus custom: true and baseNumber */
  look: { number: number; id: string; name: string; custom?: true; baseNumber?: number };
  /** non-fatal notes (e.g. "turned on stroke.enabled because stroke.width was set") */
  warnings: string[];
  /** present when a theme was applied */
  theme?: { id: string; name: string; applied: string[] };
  /** present when roles were used: how many words got each role and which role effects the look shows */
  roles?: { counts: Partial<Record<WordRole, number>>; levers: RoleLevers; stamps: WordRole[] | null };
  /** present when `layout` was given (validated); the composition applies it per card */
  layout?: LayoutSafety;
  /**
   * present when `tracks` was given: every look with its own words, style and settings (what the composition renders).
   * doc then holds every word and style/settings/look are the main (base layer, most words) track's.
   */
  tracks?: CaptionsTrack[];
}

/** "png-sequence" (0.2.0, needs captionseasy-render >= 0.2.0): a folder of transparent PNGs, frame_0000.png ... */
export type OverlayFormat = "mov" | "webm" | "png-sequence";

export interface RenderOptions {
  /** local video file */
  video: string;
  /** timed words; omit (with no transcript) to transcribe the video first */
  words?: TranscriptWord[];
  /** a Transcript from transcribe() (or its JSON); alternative to `words` */
  transcript?: { words: TranscriptWord[]; language?: string };
  /** language for transcription when no words are given (default "en") */
  language?: Language;
  /** required unless `tracks` is given */
  look?: LookRef | CustomLook;
  overrides?: StyleOverrides;
  settings?: SettingsOverrides;
  /** as in buildCaptions */
  theme?: ThemeRef;
  /** as in buildCaptions */
  roles?: RolesInput;
  /** as in buildCaptions */
  roleMap?: RoleMap;
  /** as in buildCaptions */
  stamps?: boolean | WordRole[];
  /** as in buildCaptions */
  layout?: LayoutSafety;
  /** as in buildCaptions: several looks in one video */
  tracks?: TrackPlan[];
  /** output path; default "<video>.captioned.mp4" (burn) or "<video>.captions.mov|webm" (overlay) */
  out?: string;
  /** "burn" (default): captions over the video, MP4 with the original audio. "overlay": transparent captions only. */
  mode?: "burn" | "overlay";
  /**
   * overlay container: "mov" = ProRes 4444 with alpha (default, edits in every NLE), "webm" = VP9 with alpha (small, web),
   * "png-sequence" = a folder of transparent PNGs (`out` is the folder, default <video>.captions/; render >= 0.2.0)
   */
  overlayFormat?: OverlayFormat;
  /** 0..1 */
  onProgress?: (fraction: number, stage: "transcribe" | "render") => void;
  /** frames rendered in parallel (default: half the CPU cores) */
  concurrency?: number;
  /**
   * burn only (default true; render >= 0.3.0): a look that only draws on top of the picture is rendered as captions
   * alone and laid over the video outside Chrome, with the same pixels and much faster. false draws the video in
   * Chrome too. Looks made from the video (#87, #118, #132) and backdrop blurs always take that full render.
   */
  fastBurn?: boolean;
  quiet?: boolean;
}

export interface RenderResult {
  out: string;
  mode: "burn" | "overlay";
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  look: { number: number; id: string; name: string };
  /** words that were captioned */
  words: number;
  renderMs: number;
  /** set when the video was transcribed as part of this call */
  transcribeMs?: number;
  /** png-sequence only: number of PNGs written */
  frames?: number;
  /** png-sequence only: file-name pattern for ffmpeg, e.g. "frame_%04d.png" */
  pattern?: string;
  warnings: string[];
}

// ---------------------------------------------------------------- word roles

/** What a word does in its sentence. connector = function word; key = the card's key word; title = quoted title;
 *  number = figures and number words; name = proper name / acronym; emphasis = a shouted or stressed word. */
export type WordRole = "connector" | "key" | "title" | "number" | "name" | "emphasis";
export type SizeTier = "xs" | "s" | "m" | "l" | "xl";
/** Palette roles shared by themes and role maps. */
export type PaletteRole = "ink" | "paper" | "accent" | "accent2" | "deep" | "pop";

/** How one role renders. Only effects the look honours are applied (see RoleSupport.levers). */
export interface RoleStyle {
  /** size tier relative to the card's text (xs .6, s .78, m 1, l 1.18, xl 1.4) */
  size?: SizeTier;
  /** colour from the palette (the theme's, else the look's own), or inherit */
  color?: PaletteRole | "inherit";
  /** the word's own entrance on top of its card's */
  entry?: "none" | "pop" | "slam" | "rise";
  /** draw it the way the look draws its key word (key-word colour, size, font) */
  asKey?: boolean;
  /** false hides words with this role */
  show?: boolean;
}
export type RoleMap = Partial<Record<WordRole, RoleStyle>>;
export type RolesInput = "auto" | "explicit" | (WordRole | null | undefined)[] | Record<string, WordRole>;

/** Per-word effects a look's layout really honours (measured from its renders). */
export interface RoleLevers {
  emphasis: boolean;
  color: boolean;
  size: boolean;
  entry: boolean;
}
export interface RoleSupport {
  levers: RoleLevers;
  /** the effective role map: only what this look will show */
  map: RoleMap;
  /** plain-language notes on what this look does with roles */
  notes: string[];
}

// ---------------------------------------------------------------- themes

export type ThemeEasing = "look" | "smooth" | "snappy" | "gentle" | "linear";
export interface ThemePalette {
  /** caption text over video */
  ink: string;
  /** plates, boxes, cards */
  paper: string;
  /** key word / highlight */
  accent: string;
  /** second accent (numbers, names, gradient end) */
  accent2: string;
  /** dark tone: outlines, text on a light plate */
  deep: string;
  /** rare third colour */
  pop: string;
}
export interface ThemeFonts {
  /** heavy / caps looks */
  display: string;
  /** reading looks (sentences, subtitles) */
  text: string;
  /** the key-word font of looks that have their own */
  accent: string;
}
export interface ThemeMotion {
  /** multiplies each look's own motion intensity (0.4 .. 1.6, 1 = the look's own) */
  intensity: number;
  /** entrance easing family ("look" keeps each look's own) */
  easing: ThemeEasing;
  /** entrance/exit speed multiplier (0.5 .. 2; 2 = twice as fast) */
  entrySpeed: number;
  /** word/letter stagger for looks that offer it ("look" keeps each look's own) */
  stagger: "look" | "none" | "word" | "char";
}
export interface Theme {
  id: string;
  name: string;
  description: string;
  mood: LookMood;
  tags: string[];
  palette: ThemePalette;
  fonts: ThemeFonts;
  motion: ThemeMotion;
  /** scripts all of its fonts can draw */
  scripts: Script[];
}
/** A custom theme: only `id` is required; everything else falls back to `extends` (a named theme, default "mono-editorial"). */
export interface ThemeInput {
  id: string;
  name?: string;
  description?: string;
  mood?: LookMood;
  tags?: string[];
  extends?: string;
  palette?: Partial<ThemePalette>;
  fonts?: Partial<ThemeFonts>;
  motion?: Partial<ThemeMotion>;
}
/** A named theme id or a theme object. */
export type ThemeRef = string | ThemeInput | Theme;
export interface ThemeApplication {
  id: string;
  name: string;
  /** controls the theme changed on this look */
  applied: { key: string; from: unknown; to: unknown }[];
  /** theme tokens this look has no honest control for */
  skipped: string[];
}

// ---------------------------------------------------------------- custom looks

export interface ChangedControl {
  key: string;
  from: unknown;
  to: unknown;
}
/** A named look derived from a built-in one: plain JSON, safe to store and pass around. */
export interface CustomLook {
  kind: "custom";
  /** stable: "custom:<name-slug>-<hash of base + overrides + theme + settings>" */
  id: string;
  name: string;
  description?: string;
  /** custom looks have no permanent number */
  number?: undefined;
  baseNumber: number;
  baseId: string;
  /** validated style overrides (flat dot paths) */
  overrides: Record<string, unknown>;
  settings?: Record<string, unknown>;
  theme?: string | ThemeInput;
  /** every control whose value differs from the base look */
  changed: ChangedControl[];
}
export interface DeriveLookOptions {
  name: string;
  description?: string;
  theme?: ThemeRef;
  settings?: SettingsOverrides;
}
export interface CustomLookSummary extends Omit<LookSummary, "number"> {
  number?: undefined;
  kind: "custom";
  baseNumber: number;
  baseId: string;
}
export interface CustomLookDetails extends Omit<LookDetails, "number"> {
  number?: undefined;
  kind: "custom";
  custom: { baseNumber: number; baseId: string; changed: ChangedControl[] };
}

// ---------------------------------------------------------------- languages (romanize, scripts)

export interface RomanizeWordContext {
  /** what the built-in romanizer produced for this word */
  builtIn: string;
  /** index of the word among the whitespace-separated words of the text */
  index: number;
  /** all whitespace-separated words of the original text (for context) */
  words: string[];
}
/** Return a string to replace the word, or null/undefined to keep the built-in result. */
export type RomanizeCallback = (word: string, ctx: RomanizeWordContext) => string | null | undefined;
export type RomanizeAsyncCallback = (word: string, ctx: RomanizeWordContext) => Promise<string | null | undefined> | string | null | undefined;
export interface RomanizeOptions {
  /** per-word override hook (e.g. an LLM); called once per distinct word that contains Devanagari */
  callback?: RomanizeCallback;
  /** use the exceptions dictionary (default true); false = rules only */
  dictionary?: boolean;
  /** extra/overriding exceptions: { "देव": "roman" } */
  exceptions?: Record<string, string>;
}
/** Script of a word: a writing system, or "common" for digits, punctuation and emoji. */
export type WordScript =
  | "latin" | "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "oriya" | "tamil" | "telugu" | "kannada" | "malayalam"
  | "arabic" | "hebrew" | "cyrillic" | "greek" | "thai" | "han" | "kana" | "hangul" | "common";
/** How a look draws each script: with its own fonts, through a bundled fallback font, or not at all. */
export interface LookScriptSupport {
  native: Script[];
  /** script -> the bundled fallback font that draws it */
  fallback: Partial<Record<Script, string>>;
  /** the layout splits words into letters, which breaks these scripts: romanize the words instead */
  unsupported: Script[];
  look: { number: number; id: string; name: string };
}

// ---------------------------------------------------------------- layout safety

export type Aspect = "9:16" | "1:1" | "4:5" | "16:9";
export type SafeZoneProfile = "organic" | "ads";
export type SafeZonePlatform = "tiktok" | "reels" | "shorts" | "youtube" | "linkedin";
/** Fractions of the frame covered by platform UI on each edge. */
export interface SafeMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export interface SafeZone extends SafeMargins {
  /** UI elements covering only part of an edge (e.g. the action column), as frame-fraction boxes */
  rails?: { x: number; y: number; w: number; h: number; label: string }[];
  source: string;
}
export interface SafeZoneRow extends SafeZone {
  profile: SafeZoneProfile;
  platform: SafeZonePlatform;
  aspect: Aspect;
  /** the platform's native format */
  native: boolean;
}
/** A region to keep captions off (face, burned-in text, an insert), in frame fractions, optionally time-bounded. */
export interface AvoidBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** active from this media time (ms, inclusive) */
  fromMs?: number;
  /** active until this media time (ms, exclusive) */
  toMs?: number;
  label?: string;
}
/** Optional layout safety. Absent = captions sit exactly where the look puts them. */
export interface LayoutSafety {
  /** a platform (zone for the video's aspect), explicit margins, or { platform, profile, aspect } */
  safeZone?: SafeZonePlatform | SafeMargins | { platform: SafeZonePlatform; profile?: SafeZoneProfile; aspect?: Aspect };
  avoid?: AvoidBox[];
  /** override the look's allowed vertical band (frame fractions, top < bottom) */
  band?: { top: number; bottom: number };
  /** smallest shrink factor as a last resort (default 0.7; 1 = never shrink) */
  minScale?: number;
  /** clearance around avoided regions, fraction of the frame (default 0.012) */
  padding?: number;
}
export interface PlacementInput {
  /** measured card size (frame fractions) */
  size: { w: number; h: number };
  /** where the look puts the card's centre */
  center: { x: number; y: number };
  startMs?: number;
  endMs?: number;
  band?: { top: number; bottom: number };
  safe?: SafeMargins & { rails?: { x: number; y: number; w: number; h: number }[] };
  avoid?: AvoidBox[];
  minScale?: number;
  padding?: number;
}
export interface PlacementResult {
  x: number;
  y: number;
  /** shrink factor applied (1 = none) */
  scale: number;
  moved: boolean;
  /** false when no clear spot exists: x/y/scale are then the least-overlapping spot found */
  ok: boolean;
  reason?: "no-clear-spot";
  overlaps?: string[];
}

export interface HinglishSpellingOptions {
  /** tokens either side that form the Hindi context window (default 4) */
  window?: number;
  /** minimum Hindi evidence words in the window for ambiguous rewrites (default 2) */
  minHindi?: number;
  /** extra/overriding rewrites { scholarly: creator } (lower-case keys) */
  extra?: Record<string, string>;
}
