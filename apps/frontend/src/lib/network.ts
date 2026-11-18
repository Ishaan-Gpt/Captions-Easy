/**
 * Connection helpers: a dropped or flaky connection should pause the work and carry on when the user is back,
 * never end in an error screen. Used by the API client, the upload and the in-browser speech model.
 */

/** Plain words for a connection problem, shown to users. */
export const OFFLINE_MESSAGE = "Your connection dropped. We'll carry on as soon as you're back online.";

/** A failure caused by the network, not by the server or our code ("Failed to fetch", "NetworkError ...", "Load failed"). */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, message } = e as { name?: string; message?: string };
  if (name === "NetworkUnavailableError" || name === "NetworkError") return true;
  return /failed to fetch|networkerror|network error|load failed|network request failed|err_internet_disconnected|err_network_changed|could not reach the backend/i.test(message ?? "");
}

export const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Longest a request waits for the connection to come back before giving up with OFFLINE_MESSAGE. */
export const MAX_OFFLINE_WAIT_MS = 120_000;

/**
 * Resolves true once the browser says it is online (at once if it already is), or false when it is still offline
 * after `maxMs`. Rejects with AbortError when `signal` aborts.
 */
export function waitForOnline(signal?: AbortSignal, maxMs = MAX_OFFLINE_WAIT_MS): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("online", done);
      signal?.removeEventListener("abort", stop);
      clearTimeout(timer);
    };
    const done = () => {
      cleanup();
      resolve(true);
    };
    const stop = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, maxMs);
    window.addEventListener("online", done);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Cancelled", "AbortError"));
      },
      { once: true },
    );
  });

/** Backoff between tries after a network failure: quick at first, then patient. */
export const RETRY_DELAYS_MS = [500, 1500, 4000, 8000, 15000];

/**
 * Runs `fn`; when it fails because of the network, waits until the browser is online plus a short backoff and tries
 * again (RETRY_DELAYS_MS.length more times). Any other error, or an abort, is thrown straight away.
 */
export async function withNetworkRetry<T>(fn: () => Promise<T>, opts: { signal?: AbortSignal; delays?: number[]; shouldRetry?: (e: unknown) => boolean } = {}): Promise<T> {
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const retryable = opts.shouldRetry ?? isNetworkError;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (opts.signal?.aborted || attempt >= delays.length || !retryable(e)) throw e;
      if (!(await waitForOnline(opts.signal))) throw e; // still offline after a long wait: let the caller say so
      await sleep(delays[attempt], opts.signal);
    }
  }
}
