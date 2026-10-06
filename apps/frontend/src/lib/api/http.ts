import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ERROR_STATUS, type ErrorCode } from "@capseasy/shared";

/** Throw from any handler; `route()` turns it into the standard error envelope. */
export class ApiFailure extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
}

export const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });

export function failResponse(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status: ERROR_STATUS[code] });
}

export const notFound = (what = "Resource") => new ApiFailure("NOT_FOUND", `${what} not found`);

/** Body/query validation against a zod schema from @capseasy/shared (unknown keys are stripped). */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiFailure("VALIDATION", "Request body must be valid JSON");
  }
  const res = schema.safeParse(raw);
  if (!res.success) throw new ApiFailure("VALIDATION", "Invalid request body", res.error.flatten());
  return res.data;
}

/** Wrap a handler so thrown failures/zod/unknown errors always produce the standard envelope. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiFailure) return failResponse(e.code, e.message, e.details);
      if (e instanceof ZodError) return failResponse("VALIDATION", "Invalid request", e.flatten());
      console.error(JSON.stringify({ level: "error", msg: "unhandled route error", err: e instanceof Error ? e.message : String(e) }));
      return failResponse("INTERNAL", "Something went wrong");
    }
  };
}

export type Ctx<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };
