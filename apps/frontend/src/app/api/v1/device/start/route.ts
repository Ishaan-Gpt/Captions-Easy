import { rateLimit } from "@/lib/api/rateLimit";
import { randomBytes } from "node:crypto";
import { DeviceStartBody } from "@capseasy/shared";
import { sha256, requireCompanionsEnabled } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: easy to read aloud
const userCode = () => {
  const b = randomBytes(8);
  const pick = (i: number) => ALPHABET[b[i]! % ALPHABET.length];
  return `${pick(0)}${pick(1)}${pick(2)}${pick(3)}-${pick(4)}${pick(5)}${pick(6)}${pick(7)}`;
};

const CODE_TTL_MS = 10 * 60_000;

/** Companion step 1 (unauthenticated): request a pairing code. The user approves it in the browser. */
export const POST = route(async (req: Request) => {
  requireCompanionsEnabled();
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  await rateLimit(ip, "device_start", 20, 3600);
  const body = await parseBody(req, DeviceStartBody);
  const admin = getAdmin();

  // cheap abuse guard: bound the number of live pending codes
  const { count } = await admin.from("device_codes").select("user_code", { count: "exact", head: true }).eq("status", "pending").gt("expires_at", new Date().toISOString());
  if ((count ?? 0) > 500) throw new ApiFailure("RATE_LIMITED", "Too many pairing requests. Try again in a few minutes.");

  const deviceCode = randomBytes(32).toString("hex");
  const code = userCode();
  const { error } = await admin.from("device_codes").insert({
    user_code: code,
    device_code_hash: sha256(deviceCode),
    status: "pending",
    worker_name: body.workerName,
    platform: body.platform ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new ApiFailure("INTERNAL", "Could not start pairing", error.message);

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  return ok({
    userCode: code,
    deviceCode,
    verificationUrl: `${appUrl}/pair?code=${code}`,
    intervalSeconds: 3,
    expiresInSeconds: CODE_TTL_MS / 1000,
  }, 201);
});
