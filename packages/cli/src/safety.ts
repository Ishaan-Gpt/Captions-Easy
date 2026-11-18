/**
 * Layout safety: platform safe zones per format and `avoid` boxes over time, with a deterministic placement solver.
 * Standalone module (not yet exported from index.ts): see docs/NOTES-lang-safety.md for the wiring.
 *
 * At render time the CaptionedVideo composition applies `props.layout` (LayoutSafety) per card through page.position,
 * with real font metrics. This module validates that option for agents/CLI and exposes the solver and table.
 */
import { LayoutSafetySchema, PLATFORM_PRESETS, SAFE_ZONES, SAFE_ZONE_PLATFORMS, aspectOf, safeZoneFor, type Aspect, type AvoidBox, type LayoutSafety, type SafeZone, type SafeZonePlatform, type SafeZoneProfile } from "@capseasy/shared";
import { activeAvoidBoxes, bandFor, placePages, resolveSafeZone, solvePlacement, type Band, type PlacementInput, type PlacementResult } from "@motion-ai/caption-engine/core";
import { CaptionsEasyError } from "./errors";

export { SAFE_ZONES, SAFE_ZONE_PLATFORMS, safeZoneFor, aspectOf, solvePlacement, placePages, bandFor, resolveSafeZone, activeAvoidBoxes };
export type { Aspect, AvoidBox, LayoutSafety, SafeZone, SafeZonePlatform, SafeZoneProfile, Band, PlacementInput, PlacementResult };

/** Validate a `layout` option (safe zone + avoid boxes). Throws BAD_SETTINGS with the exact problem. */
export function validateLayout(input: unknown): LayoutSafety {
  const parsed = LayoutSafetySchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new CaptionsEasyError("BAD_SETTINGS", `layout: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, {
      platforms: SAFE_ZONE_PLATFORMS,
      avoidBox: "{ x, y, w, h (0..1 fractions of the frame), fromMs?, toMs?, label? }",
    });
  }
  const v = parsed.data;
  if (v.band && v.band.top >= v.band.bottom) throw new CaptionsEasyError("BAD_SETTINGS", "layout.band: top must be above bottom (top < bottom).");
  for (const [i, b] of (v.avoid ?? []).entries()) {
    if (b.x + b.w > 1 + 1e-9 || b.y + b.h > 1 + 1e-9) throw new CaptionsEasyError("BAD_SETTINGS", `layout.avoid[${i}] extends past the frame (x + w and y + h must be <= 1).`);
    if (b.fromMs !== undefined && b.toMs !== undefined && b.toMs <= b.fromMs) throw new CaptionsEasyError("BAD_SETTINGS", `layout.avoid[${i}]: toMs must be after fromMs.`);
  }
  return v;
}

export interface SafeZoneRow extends SafeZone {
  profile: SafeZoneProfile;
  platform: SafeZonePlatform;
  aspect: Aspect;
  native: boolean;
}

/** The whole safe-zone table as rows (docs, MCP, agents). */
export function safeZoneTable(): SafeZoneRow[] {
  const rows: SafeZoneRow[] = [];
  for (const profile of ["organic", "ads"] as const)
    for (const platform of SAFE_ZONE_PLATFORMS)
      for (const [aspect, z] of Object.entries(SAFE_ZONES[profile][platform]) as [Aspect, SafeZone][])
        rows.push({ profile, platform, aspect, native: PLATFORM_PRESETS[platform].aspect === aspect, ...z });
  return rows;
}
