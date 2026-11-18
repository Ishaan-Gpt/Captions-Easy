/**
 * captionseasy: designed, animated captions for developers and AI agents. Bring your words, get styled captions.
 *
 *   listLooks()      the 105 designed caption looks (refer to one by its permanent number or id)
 *   recommendLooks() the best looks for a described video (content, tone, energy, footage, or a transcript/brief/brand)
 *   describeLook()   one look's "when to use" guide, defaults and the controls it honours (optionally under a theme)
 *   buildCaptions()  words + look (+ overrides, theme, word roles) -> validated props for the CaptionedVideo composition;
 *                    or words + tracks (several looks in one video: hook, body, stamps, CTA, with transitions)
 *   planTracks()     propose a hook / body / stamps / CTA track plan for a transcript
 *                    (render them in your own Remotion project with `captionseasy/remotion`)
 *   listThemes()     named brand themes (palette, fonts, motion) that apply to ANY look
 *   deriveLook()     a named custom look from a built-in one (stable id, validated); registerLook() to use it by id
 *   render()         [add-on captionseasy-render] burn captions into a video or export a transparent overlay
 *   transcribe()     [add-on captionseasy-transcribe] local Whisper: a video -> timed words
 *
 * No runtime dependencies. The signatures are spelled out here (types from ./types only) so the published typings
 * stay self-contained.
 */
import { loadAddon } from "./addons";
import { buildCaptions as _buildCaptions } from "./captions";
import { describeAnyLook, listAllLooks } from "./catalog";
import {
  deriveLook as _deriveLook,
  listCustomLooks as _listCustomLooks,
  loadLooksFile as _loadLooksFile,
  registerLook as _registerLook,
  saveLooksFile as _saveLooksFile,
  unregisterLook as _unregisterLook,
} from "./custom";
import { CONTENT_TYPES as _CONTENT_TYPES, PACES as _PACES, PLATFORMS as _PLATFORMS, TONES as _TONES } from "./guide";
import { FORMALITIES as _FORMALITIES, MOODS as _MOODS, SCRIPTS as _SCRIPTS, SUITS as _SUITS } from "./meta";
import { analyzeTranscript as _analyzeTranscript, recommendLooks as _recommendLooks } from "./recommend";
import { WORD_ROLES as _WORD_ROLES, assignWordRoles as _assignWordRoles } from "./roles";
import { planTracks as _planTracks } from "./plan";
import { TRACK_SLOTS as _TRACK_SLOTS, TRACK_TRANSITIONS as _TRACK_TRANSITIONS } from "./tracks";
import { describeTheme as _describeTheme, listThemes as _listThemes } from "./themes";
import { hinglishSpelling as _hinglishSpelling, hinglishSpellingWords as _hinglishSpellingWords, detectScript as _detectScript, devanagariFontFor as _devanagariFontFor, lookScripts as _lookScripts, romanize as _romanize, romanizeTranscript as _romanizeTranscript, scriptsOf as _scriptsOf } from "./lang";
import { SAFE_ZONES as _SAFE_ZONES, safeZoneFor as _safeZoneFor, safeZoneTable as _safeZoneTable, solvePlacement as _solvePlacement, validateLayout as _validateLayout } from "./safety";
import type {
  Aspect,
  HinglishSpellingOptions,
  LayoutSafety,
  LookScriptSupport,
  PlacementInput,
  PlacementResult,
  RomanizeAsyncCallback,
  RomanizeOptions,
  SafeZone,
  SafeZonePlatform,
  SafeZoneProfile,
  SafeZoneRow,
  WordScript,
  BuildCaptionsInput,
  CaptionsProps,
  ContentType,
  CustomLook,
  CustomLookDetails,
  CustomLookSummary,
  DeriveLookOptions,
  DescribeLookOptions,
  Formality,
  ListLooksOptions,
  LookDetails,
  LookMood,
  LookRecommendation,
  LookRef,
  LookSummary,
  Pace,
  Platform,
  RecommendLooksOptions,
  RenderOptions,
  RenderResult,
  Script,
  StyleOverrides,
  Suit,
  Theme,
  ThemeRef,
  Tone,
  TranscribeOptions,
  Transcript,
  TranscriptAnalysis,
  TranscriptWord,
  WordRole,
  PlanTracksOptions,
  PlanTracksResult,
  TrackSlot,
  TrackTransitionType,
} from "./types";

/** The gallery looks (retired ones excluded), optionally filtered by free text, tags or section. */
export const listLooks: {
  (opts?: ListLooksOptions & { includeCustom?: false }): LookSummary[];
  /** with includeCustom: the gallery, then the custom looks registered in this process */
  (opts: ListLooksOptions & { includeCustom: true }): (LookSummary | CustomLookSummary)[];
} = listAllLooks as never;
/**
 * One look's defaults and ONLY the controls its design honours, its "when to use" guide and its word-role support.
 * With { theme }, defaults show the themed values and `theme.applied` lists what the theme changed.
 * Custom looks ("custom:..." ids or deriveLook objects) describe their base with the custom values. Throws UNKNOWN_LOOK.
 */
export const describeLook: {
  (look: CustomLook | `custom:${string}`, opts?: DescribeLookOptions): CustomLookDetails;
  (look: LookRef, opts?: DescribeLookOptions): LookDetails;
} = describeAnyLook as never;
/**
 * Rank the looks for a described video: { content, tone, energy, footage, platform, pace, mode, query, limit } ->
 * [{ number, id, name, score, reasons, summary, usage }]. v2 inputs { transcript, brief, brand, script } read the
 * words themselves (pace, topic, energy cues, script, length) and the brand; results then also carry mood and
 * pairsWith. Deterministic; never a silent default. Throws BAD_ARGS on an unknown vocabulary word.
 */
export const recommendLooks: (opts?: RecommendLooksOptions) => LookRecommendation[] = _recommendLooks;
/** What recommendLooks reads from a transcript (pace, topic, energy cues, script, number share). */
export const analyzeTranscript: (transcript: RecommendLooksOptions["transcript"]) => TranscriptAnalysis = _analyzeTranscript;
/** The fixed vocabularies of the look guide (bestFor/avoidFor, tone, platforms, pace). */
export const CONTENT_TYPES: readonly ContentType[] = _CONTENT_TYPES;
export const TONES: readonly Tone[] = _TONES;
export const PLATFORMS: readonly Platform[] = _PLATFORMS;
export const PACES: readonly Pace[] = _PACES;
/** Look metadata vocabularies (guide.mood / formality / suits / scripts). */
export const MOODS: readonly LookMood[] = _MOODS;
export const FORMALITIES: readonly Formality[] = _FORMALITIES;
export const SUITS: readonly Suit[] = _SUITS;
export const SCRIPTS: readonly Script[] = _SCRIPTS;
/** Word roles (buildCaptions `roles`). */
export const WORD_ROLES: readonly WordRole[] = _WORD_ROLES;
/**
 * words + look (+ overrides/settings, theme, roles) -> validated composition props.
 * Throws BAD_OVERRIDE / BAD_SETTINGS / BAD_WORDS / BAD_THEME / BAD_ARGS / UNKNOWN_LOOK.
 */
export const buildCaptions: (input: BuildCaptionsInput) => CaptionsProps = _buildCaptions;
/**
 * Propose several looks for one video from its transcript (hook / body / key-word stamps / CTA under one theme, with
 * transitions): { theme, tracks, looks, reasons }. Deterministic (recommendLooks + pairsWith). Pass theme + tracks to buildCaptions.
 */
export const planTracks: (opts: PlanTracksOptions) => PlanTracksResult = _planTracks;
/** Track slots, transitions and fallback exits accepted in buildCaptions({ tracks }). */
export const TRACK_SLOTS: readonly TrackSlot[] = _TRACK_SLOTS;
export const TRACK_TRANSITIONS: readonly TrackTransitionType[] = _TRACK_TRANSITIONS;
/** The roles the rules give these words (same order); explicit `words[].role` values are kept. */
export const assignWordRoles: (words: TranscriptWord[], opts?: { maxWordsPerCard?: number }) => (WordRole | undefined)[] = _assignWordRoles;

/** The named brand themes. */
export const listThemes: () => Theme[] = _listThemes;
/** A theme (by id, or a custom theme object validated and completed) plus which look control each token drives. Throws BAD_THEME. */
export const describeTheme: (theme: ThemeRef) => Theme & { tokens: Record<string, string> } = _describeTheme;

/**
 * A named custom look from a built-in (or custom) look: overrides validated against the base's controls, an optional
 * theme and pacing. Returns plain JSON with a stable id ("custom:<slug>-<hash>") and the changed controls.
 */
export const deriveLook: (base: LookRef | CustomLook, overrides: StyleOverrides, opts: DeriveLookOptions) => CustomLook = _deriveLook;
/** Register custom looks in this process (validated), so their ids work everywhere a look is accepted. */
export const registerLook: { (look: CustomLook): CustomLook; (looks: CustomLook[]): CustomLook[] } = _registerLook;
export const unregisterLook: (id: string) => boolean = _unregisterLook;
export const listCustomLooks: () => CustomLook[] = _listCustomLooks;
/** Read + register custom looks from a JSON file (an array or { looks: [...] }). */
export const loadLooksFile: (path: string) => CustomLook[] = _loadLooksFile;
/** Write custom looks to a JSON file ({ looks: [...] }), replacing same-id entries. Returns the absolute path. */
export const saveLooksFile: (path: string, looks: CustomLook[]) => string = _saveLooksFile;

/**
 * Caption a local video: burn in (MP4) or a transparent overlay (.mov ProRes 4444 / .webm VP9).
 * Needs the optional add-on `captionseasy-render` (throws ADDON_MISSING with the install command otherwise).
 */
export async function render(opts: RenderOptions): Promise<RenderResult> {
  return (await loadAddon("render")).render(opts);
}

/**
 * Local speech-to-text with word timestamps. Needs the optional add-on `captionseasy-transcribe`
 * (throws ADDON_MISSING with the install command otherwise).
 */
export async function transcribe(videoPath: string, opts?: TranscribeOptions): Promise<Transcript> {
  return (await loadAddon("transcribe")).transcribe(videoPath, opts);
}

// ---------------------------------------------------------------- languages + layout safety

/** Devanagari -> Hinglish as creators type it (pehle, karte hain). Async when the callback returns a Promise (e.g. an LLM). */
export const romanize: { (text: string, opts?: RomanizeOptions): string; (text: string, opts: Omit<RomanizeOptions, "callback"> & { callback: RomanizeAsyncCallback }): Promise<string> } = _romanize as never;
/** Romanize transcript words (timings and other fields kept). Run it before buildCaptions for an LLM hook. */
export const romanizeTranscript: {
  <W extends TranscriptWord>(words: W[], opts?: RomanizeOptions): W[];
  <W extends TranscriptWord>(words: W[], opts: Omit<RomanizeOptions, "callback"> & { callback: RomanizeAsyncCallback }): Promise<W[]>;
} = _romanizeTranscript as never;
/** Rewrite scholarly romanized Hindi (yah, kyonki, achchha) the way creators type it (yeh, kyunki, achha); English untouched. */
export const hinglishSpelling: (text: string, opts?: HinglishSpellingOptions) => string = _hinglishSpelling;
export const hinglishSpellingWords: <W extends { text: string }>(words: W[], opts?: HinglishSpellingOptions) => W[] = _hinglishSpellingWords;
/** Dominant script of a word ("common" for digits/punctuation). */
export const detectScript: (word: string) => WordScript = _detectScript as never;
/** Every script used in a text, first seen first. */
export const scriptsOf: (text: string) => Exclude<WordScript, "common">[] = _scriptsOf as never;
/** How a look draws each script: natively, through a bundled fallback font, or not at all (romanize then). */
export const lookScripts: (look: LookRef) => LookScriptSupport = _lookScripts as never;
/** The font that draws Devanagari for a look font (itself when it has the glyphs). */
export const devanagariFontFor: (fontId: string) => string = _devanagariFontFor;
/** Platform safe zones: profile -> platform -> aspect -> margins (fractions of the frame), with sources. */
export const SAFE_ZONES: Record<SafeZoneProfile, Record<SafeZonePlatform, Record<Aspect, SafeZone>>> = _SAFE_ZONES as never;
export const safeZoneFor: (platform: SafeZonePlatform, aspect?: Aspect, profile?: SafeZoneProfile) => SafeZone = _safeZoneFor as never;
/** The whole safe-zone table as rows. */
export const safeZoneTable: () => SafeZoneRow[] = _safeZoneTable as never;
/** Nearest clear spot for one card inside its band, avoiding safe-zone margins and avoid boxes. Deterministic. */
export const solvePlacement: (input: PlacementInput) => PlacementResult = _solvePlacement as never;
/** Validate a `layout` option. Throws BAD_SETTINGS. */
export const validateLayout: (layout: unknown) => LayoutSafety = _validateLayout as never;

export { CaptionsEasyError, isCaptionsEasyError, type CaptionsEasyErrorCode } from "./errors";
export { VERSION } from "./version";
export type * from "./types";
