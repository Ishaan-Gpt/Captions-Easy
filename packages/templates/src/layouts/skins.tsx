import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import { darken, lighten } from "@motion-ai/caption-engine/core";
import { firstColor } from "../text";

/**
 * Skins for the three-line stack (body / giant hero / body). Ported from the legacy STACK_SKINS with
 * identical numbers; every value that used to read the old CaptionStyle now reads CaptionStyleV2.
 */
export interface StackSkin {
  bodyFont: (s: CaptionStyleV2) => string;
  bodyWeight: (s: CaptionStyleV2) => number;
  bodyColor: (s: CaptionStyleV2) => string;
  bodyCss?: (s: CaptionStyleV2) => React.CSSProperties;
  bodySizeScale: number;
  heroFont: (s: CaptionStyleV2) => string;
  heroWeight: (s: CaptionStyleV2) => number;
  heroScale: (s: CaptionStyleV2) => number;
  heroCss: (s: CaptionStyleV2, heroSize: number, sc: number) => React.CSSProperties;
  heroCasing?: "upper" | "lower";
  heroSuffix?: (s: CaptionStyleV2) => React.ReactNode;
  backdrop?: (s: CaptionStyleV2, heroSize: number, lineGap: number) => React.ReactNode;
  lineGapScale: number;
  splash: boolean;
  bodyHighlightFlash?: boolean;
}

const acc = (s: CaptionStyleV2, fallback: string) => s.active.color || fallback;
const blob = (css: React.CSSProperties) => (
  <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 0, pointerEvents: "none", ...css }} />
);

export const STACK_SKINS: Record<string, StackSkin> = {
  staggered_3line: {
    bodyFont: (s) => s.fontId,
    bodyWeight: () => 700,
    bodyColor: (s) => firstColor(s.fill) || "#FFFFFF",
    bodySizeScale: 1.1,
    heroFont: (s) => s.hero.fontId || "Anton",
    heroWeight: (s) => s.hero.fontWeight || 900,
    heroScale: (s) => s.hero.scale ?? 1.5,
    heroCasing: "upper",
    heroCss: (s, _h, sc) => ({
      color: acc(s, "#C5FF00"),
      WebkitTextStroke: `${(s.stroke.enabled ? s.stroke.width : 2) * sc}px ${s.stroke.color || "#000000"}`,
      paintOrder: "stroke fill",
    } as React.CSSProperties),
    lineGapScale: 1.25,
    splash: true,
  },
  glow_stack: {
    bodyFont: (s) => s.fontId,
    bodyWeight: () => 800,
    bodyColor: () => "#FFFFFF",
    bodySizeScale: 1.2,
    heroFont: (s) => s.hero.fontId || "Anton",
    heroWeight: (s) => s.hero.fontWeight || 900,
    heroScale: (s) => s.hero.scale ?? 2.3,
    heroCasing: "upper",
    heroCss: (s, _h, sc) => ({ color: acc(s, "#4FA8FF"), textShadow: `0px ${4 * sc}px ${8 * sc}px rgba(0,0,0,0.45)` }),
    backdrop: (_s, heroSize, lineGap) =>
      blob({
        width: heroSize * 3.2, height: lineGap * 3.4, filter: "blur(28px)",
        background: "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(10,16,32,0.55), rgba(10,16,32,0.28) 55%, transparent 78%)",
      }),
    lineGapScale: 1.1,
    splash: true,
  },
  cartoon_stack: {
    bodyFont: (s) => s.fontId,
    bodyWeight: () => 700,
    bodyColor: (s) => firstColor(s.fill) || "#FFFFFF",
    bodySizeScale: 0.85,
    heroFont: (s) => s.hero.fontId || "Fredoka",
    heroWeight: (s) => s.hero.fontWeight || 700,
    heroScale: (s) => s.hero.scale ?? 1.6,
    heroCasing: "lower",
    heroCss: (s, heroSize, sc) => ({
      color: acc(s, "#EDE0A6"),
      WebkitTextStroke: `${Math.max(4 * sc, heroSize * 0.055)}px ${darken(acc(s, "#EDE0A6"), 0.65)}`,
      paintOrder: "stroke fill",
      textShadow: `0px ${5 * sc}px ${6 * sc}px rgba(0,0,0,0.45)`,
    } as React.CSSProperties),
    lineGapScale: 0.95,
    splash: false,
  },
  serif_pop: {
    bodyFont: (s) => s.fontId,
    bodyWeight: () => 900,
    bodyColor: () => "#FFD700",
    bodyCss: () => ({ color: "#FFD700", textShadow: "0px 2px 4px rgba(0,0,0,0.9), 0px 4px 12px rgba(0,0,0,0.85), 0px 0px 2px #000000" }),
    bodySizeScale: 1.0,
    heroFont: (s) => s.hero.fontId || "Kaushan Script",
    heroWeight: (s) => s.hero.fontWeight || 400,
    heroScale: (s) => s.hero.scale ?? 1.8,
    heroCss: () => ({ color: "#FFD700", textShadow: "0px 3px 6px rgba(0,0,0,0.9), 0px 6px 16px rgba(0,0,0,0.85), 0px 0px 3px #000000" }),
    heroSuffix: (s) => (s.templateOptions.accentPeriod === false ? null : <span style={{ color: acc(s, "#FFEE00") }}>.</span>),
    lineGapScale: 1.15,
    splash: true,
    bodyHighlightFlash: true,
  },
  cinematic_emerald: {
    bodyFont: (s) => s.fontId,
    bodyWeight: (s) => s.fontWeight || 600,
    bodyColor: () => "#FFFFFF",
    bodyCss: (s) => ({
      textShadow: `0px 1px 0px rgba(255,255,255,0.55), 0px -1px 0px rgba(0,0,0,0.18), 0px 6px 16px rgba(0,0,0,0.4), 0px 0px 20px ${acc(s, "#8CFF3E")}40`,
    }),
    bodySizeScale: 1.1,
    heroFont: (s) => s.hero.fontId || "Playfair Display",
    heroWeight: (s) => s.hero.fontWeight || 900,
    heroScale: (s) => s.hero.scale ?? 2.2,
    heroCss: (s, _h, sc) => {
      const hl = acc(s, "#8CFF3E");
      const light = lighten(hl, 0.45);
      const dark = darken(hl, 0.3);
      return {
        fontStyle: "italic",
        letterSpacing: "-0.01em",
        background: `linear-gradient(160deg, ${dark} 0%, ${hl} 45%, ${light} 100%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        rotate: "-4deg",
        textShadow: `0px ${8 * sc}px ${25 * sc}px rgba(0,0,0,0.3), 0px 0px ${36 * sc}px ${light}b3, 0px 0px ${14 * sc}px ${hl}cc`,
      } as React.CSSProperties;
    },
    backdrop: (s, heroSize) => {
      const hl = acc(s, "#8CFF3E");
      const light = lighten(hl, 0.45);
      return blob({
        width: heroSize * 4, height: heroSize * 2.2, filter: "blur(18px)",
        background: `radial-gradient(ellipse at center, ${light}66 0%, ${hl}33 45%, transparent 75%)`,
      });
    },
    lineGapScale: 1.05,
    splash: false,
  },
};
