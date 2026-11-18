/** Sentry SENTRY-COPPER-QUEEN-C: a demuxer seek error on a blob video killed the Player; now it never throws. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_VIDEO_RELOADS, nextVideoReload, playerVideoKey, usePlayerVideoRecovery } from "./CaptionedVideo";

describe("player video recovery", () => {
  it("reloads quietly up to the budget, then stops reloading", () => {
    let reloads = 0;
    const seen: number[] = [];
    for (let next = nextVideoReload(reloads); next !== null; next = nextVideoReload(reloads)) {
      seen.push(next);
      reloads = next;
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(PLAYER_VIDEO_RELOADS).toBe(3);
    expect(nextVideoReload(PLAYER_VIDEO_RELOADS)).toBeNull();
  });

  it("gives each reload a new element key for the same source", () => {
    const keys = [0, 1, 2].map((n) => playerVideoKey("blob:https://x/abc", n));
    expect(new Set(keys).size).toBe(3);
    expect(playerVideoKey(null, 0)).toBe("#0");
  });

  it("starts with the first key and an onError handler", () => {
    let result: ReturnType<typeof usePlayerVideoRecovery> | null = null;
    const Probe = () => {
      result = usePlayerVideoRecovery("blob:https://x/abc");
      return null;
    };
    renderToStaticMarkup(React.createElement(Probe));
    expect(result!.key).toBe("blob:https://x/abc#0");
    expect(result!.failed).toBe(false);
    expect(typeof result!.onError).toBe("function");
    expect(typeof result!.reload).toBe("function");
  });
});
