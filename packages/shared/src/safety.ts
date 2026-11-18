/**
 * Layout safety (additive): platform safe zones per aspect ratio, and "avoid" boxes over time.
 * PLATFORM_PRESETS[...].unsafe (settings.ts) is unchanged; SAFE_ZONES.organic reuses those exact numbers for each
 * platform's native aspect and adds the other formats.
 */
import { z } from "zod";
import { PLATFORM_PRESETS, type Platform, type PlatformPreset } from "./settings";

export type Aspect = PlatformPreset["aspect"];
export const ASPECTS: readonly Aspect[] = ["9:16", "1:1", "4:5", "16:9"] as const;
/** fractions of the frame covered by platform UI on each edge */
export interface SafeMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
/** a UI element that covers only part of an edge (e.g. the action column), as a frame-fraction box */
export interface SafeRail {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
export interface SafeZone extends SafeMargins {
  rails?: SafeRail[];
  source: string;
}
export type SafeZoneProfile = "organic" | "ads";
export type SafeZonePlatform = Exclude<Platform, "podcast" | "custom">;
export const SAFE_ZONE_PLATFORMS: readonly SafeZonePlatform[] = ["tiktok", "reels", "shorts", "youtube", "linkedin"] as const;

const zone = (top: number, bottom: number, left: number, right: number, source: string, rails?: SafeRail[]): SafeZone => ({ top, bottom, left, right, source, ...(rails ? { rails } : {}) });
const PRESET = "PLATFORM_PRESETS.unsafe (captionseasy default since 0.1)";
const EST = "estimate from the app's UI overlays (no official organic spec); conservative";
const META = "Meta Business Help Center, Reels/Stories ad safe zones: 14% top, 35% bottom, 6% sides (facebook.com/business/help/980593475366490)";
const TT_ADS = "TikTok In-Feed ad preview measurements, adkit.so/tools/safe-zones/tiktok: 240px top, 660px bottom, 120px sides, 300px action column below y=840 on 1080x1920";
const IG_FEED = "adkit.so/tools/safe-zones/instagram feed buffers (108px / 135px on 1080 wide)";

/**
 * Safe zones per profile x platform x aspect, as fractions of the frame. Sources are cited per entry; platforms change
 * their UI, so these are sensible defaults: pass explicit margins to override.
 * - organic: posts as viewers see them (caption text, username, music row, action column)
 * - ads: paid placements, which add CTA buttons and ad labels (larger bottom zone)
 */
export const SAFE_ZONES: Record<SafeZoneProfile, Record<SafeZonePlatform, Record<Aspect, SafeZone>>> = {
  organic: {
    tiktok: { "9:16": zone(0.1, 0.22, 0.05, 0.14, PRESET), "1:1": zone(0.06, 0.14, 0.04, 0.12, EST), "4:5": zone(0.08, 0.18, 0.05, 0.14, EST), "16:9": zone(0.05, 0.1, 0.05, 0.08, EST) },
    reels: { "9:16": zone(0.12, 0.2, 0.05, 0.12, PRESET), "1:1": zone(0.04, 0.08, 0.04, 0.04, EST), "4:5": zone(0.05, 0.1, 0.04, 0.04, EST), "16:9": zone(0.05, 0.1, 0.05, 0.05, EST) },
    shorts: { "9:16": zone(0.1, 0.2, 0.05, 0.14, PRESET), "1:1": zone(0.05, 0.12, 0.05, 0.12, EST), "4:5": zone(0.06, 0.15, 0.05, 0.12, EST), "16:9": zone(0.05, 0.1, 0.05, 0.05, EST) },
    youtube: {
      "9:16": zone(0.1, 0.2, 0.05, 0.14, `same UI as YouTube Shorts (${PRESET})`),
      "1:1": zone(0.05, 0.1, 0.05, 0.05, EST),
      "4:5": zone(0.05, 0.1, 0.05, 0.05, EST),
      "16:9": zone(0.05, 0.1, 0.05, 0.05, `${PRESET}; close to the classic action-safe area (SMPTE ST 2046-1)`),
    },
    linkedin: { "9:16": zone(0.08, 0.18, 0.05, 0.1, EST), "1:1": zone(0.05, 0.12, 0.05, 0.05, PRESET), "4:5": zone(0.05, 0.12, 0.05, 0.05, EST), "16:9": zone(0.05, 0.12, 0.05, 0.05, EST) },
  },
  ads: {
    tiktok: {
      "9:16": zone(0.125, 0.344, 0.111, 0.111, TT_ADS, [{ x: 0.722, y: 0.4375, w: 0.278, h: 0.5625, label: "action column" }]),
      "1:1": zone(0.08, 0.2, 0.06, 0.12, EST),
      "4:5": zone(0.1, 0.25, 0.08, 0.12, EST),
      "16:9": zone(0.06, 0.14, 0.05, 0.08, EST),
    },
    reels: {
      "9:16": zone(0.14, 0.35, 0.06, 0.06, META, [{ x: 0.79, y: 0.6, w: 0.21, h: 0.4, label: "action column" }]),
      "1:1": zone(0.1, 0.1, 0.1, 0.1, IG_FEED),
      "4:5": zone(0.1, 0.1, 0.1, 0.1, IG_FEED),
      "16:9": zone(0.06, 0.12, 0.06, 0.06, EST),
    },
    shorts: { "9:16": zone(0.12, 0.3, 0.06, 0.16, EST), "1:1": zone(0.06, 0.14, 0.05, 0.12, EST), "4:5": zone(0.08, 0.18, 0.05, 0.12, EST), "16:9": zone(0.06, 0.14, 0.05, 0.05, EST) },
    youtube: {
      "9:16": zone(0.12, 0.3, 0.06, 0.16, EST),
      "1:1": zone(0.06, 0.14, 0.05, 0.05, EST),
      "4:5": zone(0.06, 0.14, 0.05, 0.05, EST),
      "16:9": zone(0.06, 0.16, 0.05, 0.05, `${EST} (skip button + ad bar along the bottom)`),
    },
    linkedin: { "9:16": zone(0.1, 0.22, 0.06, 0.1, EST), "1:1": zone(0.06, 0.14, 0.05, 0.05, EST), "4:5": zone(0.06, 0.14, 0.05, 0.05, EST), "16:9": zone(0.06, 0.14, 0.05, 0.05, EST) },
  },
};

/** Aspect of a canvas, snapped to the nearest supported format. */
export function aspectOf(width: number, height: number): Aspect {
  const r = width / height;
  const opts: [Aspect, number][] = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9]];
  return opts.reduce((best, o) => (Math.abs(Math.log(r / o[1])) < Math.abs(Math.log(r / best[1])) ? o : best))[0];
}

/** Safe zone for a platform + aspect (default: the platform's native aspect, organic profile). */
export function safeZoneFor(platform: SafeZonePlatform, aspect?: Aspect, profile: SafeZoneProfile = "organic"): SafeZone {
  return SAFE_ZONES[profile][platform][aspect ?? PLATFORM_PRESETS[platform].aspect];
}

/** A region to keep captions off (face, burned-in text, an insert), in frame fractions, optionally time-bounded. */
export const AvoidBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  /** active from this media time (ms, inclusive); omitted = from the start */
  fromMs: z.number().nonnegative().optional(),
  /** active until this media time (ms, exclusive); omitted = to the end */
  toMs: z.number().nonnegative().optional(),
  label: z.string().optional(),
});
export type AvoidBox = z.infer<typeof AvoidBoxSchema>;

export const SafeMarginsSchema = z.object({
  top: z.number().min(0).max(0.5),
  bottom: z.number().min(0).max(0.5),
  left: z.number().min(0).max(0.5),
  right: z.number().min(0).max(0.5),
});
const SafePlatformSchema = z.enum(["tiktok", "reels", "shorts", "youtube", "linkedin"]);

/**
 * Optional per-render layout safety. Absent = captions sit exactly where the look puts them (unchanged behaviour).
 * - safeZone: a platform name (zone picked for the video's aspect), explicit margins, or { platform, profile, aspect }
 * - avoid: boxes over time (face, burned-in text, insert)
 * - band: override the look's allowed vertical band for the caption box (frame fractions, top < bottom)
 */
export const LayoutSafetySchema = z.object({
  safeZone: z
    .union([SafePlatformSchema, SafeMarginsSchema, z.object({ platform: SafePlatformSchema, profile: z.enum(["organic", "ads"]).optional(), aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]).optional() })])
    .optional(),
  avoid: z.array(AvoidBoxSchema).optional(),
  band: z.object({ top: z.number().min(0).max(1), bottom: z.number().min(0).max(1) }).optional(),
  /** smallest shrink factor allowed as a last resort (default 0.7; 1 = never shrink) */
  minScale: z.number().min(0.3).max(1).optional(),
  /** gap kept between the caption box and any avoided region, as a fraction of the frame (default 0.012) */
  padding: z.number().min(0).max(0.1).optional(),
});
export type LayoutSafety = z.infer<typeof LayoutSafetySchema>;
