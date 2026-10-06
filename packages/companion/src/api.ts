import type { JobPayload, WorkerCapabilities } from "@capseasy/shared";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ClaimedJob {
  job: { id: string; kind: "transcribe" | "render" | "proxy" | "thumbnail" | "enrich"; attempts: number; projectId: string; payload: JobPayload };
  media: { width: number | null; height: number | null; fps: number | null; durationMs: number | null; hasAudio: boolean | null; rotation: number | null; mime: string | null } | null;
  urls: { sourceGet?: string; previewPut?: string; thumbnailPut?: string; exportPut?: string };
  leaseSeconds: number;
}

/**
 * Thin typed client. Network errors and 5xx are retried with backoff + jitter; 4xx never are
 * (except the caller decides what to do with 409 LEASE_LOST).
 */
export class CompanionApi {
  constructor(private base: string, private token?: string) {}

  private async req<T>(method: string, path: string, body?: unknown, opts: { retries?: number; signal?: AbortSignal } = {}): Promise<T | null> {
    const retries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${this.base.replace(/\/$/, "")}/api/v1${path}`, {
          method,
          headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: opts.signal,
        });
        if (res.status === 204) return null;
        const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
        if (res.ok && json.success !== false) return json.data as T;
        if (res.status >= 500 && attempt < retries) throw new ApiError(res.status, json.error?.code ?? "SERVER", json.error?.message ?? "server error");
        throw new ApiError(res.status, json.error?.code ?? "UNKNOWN", json.error?.message ?? `HTTP ${res.status}`, json.error?.details);
      } catch (e) {
        const retryable = (e instanceof ApiError && e.status >= 500) || (!(e instanceof ApiError) && !(e instanceof DOMException && e.name === "AbortError"));
        if (!retryable || attempt >= retries) throw e;
        await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.random() * 300);
      }
    }
  }

  // ---- device flow (unauthenticated)
  deviceStart(body: { workerName: string; platform: string; version: string }) {
    return this.req<{ userCode: string; deviceCode: string; verificationUrl: string; intervalSeconds: number; expiresInSeconds: number }>("POST", "/device/start", body);
  }
  deviceToken(deviceCode: string, me?: { workerName: string; platform: string }) {
    return this.req<{ status: "pending" | "approved" | "denied" | "expired"; workerId?: string; token?: string }>("POST", "/device/token", { deviceCode, ...me });
  }

  // ---- worker
  heartbeat(body: { version: string; platform: string; capabilities: WorkerCapabilities; currentJobId: string | null }) {
    return this.req<{ workerId: string; minVersion: string; pollHintMs: number; hasWork?: boolean; cancelJobIds: string[] }>("POST", "/worker/heartbeat", body);
  }
  /** One claim attempt (`waitMs` 0), or a long-poll: the server holds the request up to `waitMs` until a job is queued. */
  claim(kinds: string[], waitMs = 0) {
    return this.req<ClaimedJob>("POST", "/worker/jobs/claim", { kinds, waitMs }, { retries: 1 });
  }
  progress(jobId: string, stage: string, progress: number, message?: string) {
    return this.req<{ cancelRequested: boolean }>("POST", `/worker/jobs/${jobId}/progress`, { stage, progress, message }, { retries: 1 });
  }
  complete(jobId: string, result: unknown) {
    return this.req<{ status: string }>("POST", `/worker/jobs/${jobId}/complete`, result);
  }
  fail(jobId: string, errorCode: string, message: string, retryable: boolean) {
    return this.req<{ status: string }>("POST", `/worker/jobs/${jobId}/fail`, { errorCode, message: message.slice(0, 1900), retryable });
  }
  urls(jobId: string) {
    return this.req<{ urls: ClaimedJob["urls"] }>("POST", `/worker/jobs/${jobId}/urls`, {});
  }
}
