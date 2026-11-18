import { z } from "zod";
import { CaptionDocSchema, CaptionStyleSchema, LayoutSafetySchema, ProjectSettingsSchema, emptyDoc } from "@capseasy/shared";

/** How a track takes over from the previous track on its layer (see tracks.ts). */
export const TrackTransitionSchema = z.object({
  type: z.enum(["cut", "exit-entry", "morph"]).default("cut"),
  durationMs: z.number().min(0).max(1500).default(260),
  overlapMs: z.number().min(0).max(1000).default(0),
});
/** One look on part of the words (a slot of a multi-look caption track: hook, body, stamps, CTA ...). */
export const CaptionTrackSchema = z.object({
  id: z.string().default("track"),
  slot: z.string().optional(),
  /** drawing order: higher layers draw above lower ones (DOM order, no z-index); hand-overs happen within a layer */
  layer: z.number().int().min(0).max(9).default(0),
  doc: CaptionDocSchema.default(emptyDoc()),
  style: CaptionStyleSchema.default({}),
  settings: ProjectSettingsSchema.default({}),
  /** how this track enters when it takes over from the previous track on its layer */
  transition: TrackTransitionSchema.default({}),
  /** how this track leaves at a hand-over: its look's own exit (native) or a whole-card envelope */
  exit: z.object({ type: z.string().default("fade"), native: z.boolean().default(false) }).default({}),
});
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>;

export const MediaMetaSchema = z.object({
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().positive().default(30),
  durationMs: z.number().nonnegative().default(0),
  rotation: z.number().default(0),
});

/** The one input contract for preview (Player) and export (renderMedia). */
export const CaptionedVideoProps = z.object({
  /** video URL; null renders captions only (stills, overlay exports) */
  src: z.string().nullable().default(null),
  media: MediaMetaSchema.default({}),
  doc: CaptionDocSchema.default(emptyDoc()),
  style: CaptionStyleSchema.default({}),
  settings: ProjectSettingsSchema.default({}),
  /** "burn" composites over the video; "overlay" is transparent captions only */
  mode: z.enum(["burn", "overlay"]).default("burn"),
  /** CSS background painted when there is no video in burn mode (look previews, demos) */
  backdrop: z.string().nullable().default(null),
  /**
   * How the source video is decoded. "offthread" (default): the Companion's renderMedia and the Player.
   * "media": @remotion/media's <Video>, required by the in-browser renderer (@remotion/web-renderer).
   */
  videoEngine: z.enum(["offthread", "media"]).default("offthread"),
  /**
   * Optional layout safety: platform safe zone and/or avoid boxes over time (face, burned-in text, insert). Cards
   * that would sit in them move to the nearest clear spot in the look's band. Absent/null = unchanged placement.
   */
  layout: LayoutSafetySchema.nullable().default(null),
  /**
   * Optional multi-look caption track: several looks in one video, each on its own words, with transitions at the
   * hand-overs. When set (non-empty) it is what renders, and doc/style/settings above are only the summary (the full
   * doc and the main look). Absent/null = the single-look render, unchanged.
   */
  tracks: z.array(CaptionTrackSchema).nullable().default(null),
});
export type CaptionedVideoProps = z.infer<typeof CaptionedVideoProps>;
export type CaptionedVideoInput = z.input<typeof CaptionedVideoProps>;
