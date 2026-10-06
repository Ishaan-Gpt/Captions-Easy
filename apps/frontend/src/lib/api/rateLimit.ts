import "server-only";
import { getAdmin } from "../supabase/admin";
import { ApiFailure } from "./http";

/**
 * Fixed-window rate limit backed by Postgres (no Redis): `max` hits per `windowSeconds` per user + bucket.
 * Fails open if the database call itself errors, so an outage in this helper never blocks users.
 */
export async function rateLimit(subject: string, bucket: string, max: number, windowSeconds: number): Promise<void> {
  const { data, error } = await getAdmin().rpc("rate_limit_hit", { p_key: `${bucket}:${subject}`, p_window_s: windowSeconds });
  if (error) return;
  if (typeof data === "number" && data > max) {
    throw new ApiFailure("RATE_LIMITED", "You're doing that too often. Please wait a bit and try again.", { retryAfterSeconds: windowSeconds });
  }
}
