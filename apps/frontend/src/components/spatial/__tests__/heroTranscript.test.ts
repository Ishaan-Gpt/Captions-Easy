// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTranscript } from "../heroTranscript";

// Sentry SENTRY-COPPER-QUEEN-3 / -17: a dropped /hero/<clip>.json fetch was an unhandled rejection on the homepage.
describe("loadTranscript", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves null instead of rejecting when the fetch fails, and retries next time", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("NetworkError: A network error occurred."))
      .mockResolvedValueOnce(new Response(JSON.stringify({ language: "en", durationMs: 1000, words: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadTranscript("offline-clip")).resolves.toBeNull();
    await expect(loadTranscript("offline-clip")).resolves.toEqual({ language: "en", durationMs: 1000, words: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an HTTP error as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(loadTranscript("down-clip")).resolves.toBeNull();
  });

  it("fetches each clip once when it works", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ language: "en", durationMs: 1, words: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await loadTranscript("ok-clip");
    await loadTranscript("ok-clip");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
