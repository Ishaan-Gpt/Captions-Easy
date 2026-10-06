export const ERROR_CODES = [
  "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "VALIDATION", "CONFLICT", "REVISION_CONFLICT", "LIMIT_EXCEEDED",
  "NO_COMPANION", "UNSUPPORTED_MEDIA", "UPSTREAM_FAILED", "RATE_LIMITED", "LEASE_LOST", "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, REVISION_CONFLICT: 409,
  LIMIT_EXCEEDED: 402, NO_COMPANION: 409, UNSUPPORTED_MEDIA: 415, UPSTREAM_FAILED: 502, RATE_LIMITED: 429,
  LEASE_LOST: 409, INTERNAL: 500,
};

export interface ApiOk<T> { success: true; data: T }
export interface ApiErr { success: false; error: { code: ErrorCode; message: string; details?: unknown } }
export type ApiResponse<T> = ApiOk<T> | ApiErr;
