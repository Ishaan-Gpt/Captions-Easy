import { afterEach, describe, expect, it, vi } from "vitest";
import { isNetworkError, waitForOnline, withNetworkRetry } from "../network";

const setOnline = (on: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => on });

describe("isNetworkError", () => {
  it("knows each browser's words for a dropped connection", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true); // Chrome
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true); // Firefox
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true); // Safari
    expect(isNetworkError(new Error("network error"))).toBe(true); // speech model download
    expect(isNetworkError(Object.assign(new Error("x"), { name: "NetworkUnavailableError" }))).toBe(true);
  });

  it("leaves real errors alone", () => {
    expect(isNetworkError(new Error("Job not found"))).toBe(false);
    expect(isNetworkError(new DOMException("Cancelled", "AbortError"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe("withNetworkRetry", () => {
  afterEach(() => setOnline(true));

  it("retries a dropped connection and returns the answer", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Load failed")).mockResolvedValue("ok");
    await expect(withNetworkRetry(fn, { delays: [0, 0, 0] })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry an answer from the server", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Job not found"));
    await expect(withNetworkRetry(fn, { delays: [0, 0] })).rejects.toThrow("Job not found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last delay", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(withNetworkRetry(fn, { delays: [0, 0] })).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("waitForOnline", () => {
  afterEach(() => setOnline(true));

  it("waits for the browser to come back online", async () => {
    setOnline(false);
    let back = false;
    const p = waitForOnline(undefined, 10_000).then((v) => (back = v));
    await Promise.resolve();
    expect(back).toBe(false);
    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await expect(p).resolves.toBe(true);
  });

  it("returns false when still offline after the limit", async () => {
    setOnline(false);
    await expect(waitForOnline(undefined, 20)).resolves.toBe(false);
  });
});
