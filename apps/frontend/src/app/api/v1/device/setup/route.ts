import { randomBytes } from "node:crypto";
import { rateLimit } from "@/lib/api/rateLimit";
import { requireUser, sha256, requireCompanionsEnabled } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SETUP_TTL_MS = 30 * 60_000;

/**
 * One-click "Connect this computer": a device code that is created ALREADY APPROVED for the signed-in user. The
 * web app bakes it into the setup file it downloads, so the Companion pairs itself with no browser step.
 * Single use (the token route consumes it), expires in 30 minutes, and only works for the account that made it.
 */
export const POST = route(async (req: Request) => {
  requireCompanionsEnabled();
  const user = await requireUser(req);
  await rateLimit(user.id, "device_setup", 20, 3600);
  const deviceCode = randomBytes(32).toString("hex");
  const b = randomBytes(8);
  const code = `S${Array.from(b.subarray(0, 7), (x) => ALPHABET[x % ALPHABET.length]).join("")}`;
  const now = Date.now();
  const { error } = await getAdmin().from("device_codes").insert({
    user_code: code,
    device_code_hash: sha256(deviceCode),
    status: "approved",
    owner_id: user.id,
    approved_at: new Date(now).toISOString(),
    worker_name: null,
    platform: null,
    expires_at: new Date(now + SETUP_TTL_MS).toISOString(),
  });
  if (error) throw new ApiFailure("INTERNAL", "Could not prepare the setup file", error.message);
  const appUrl = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  return ok({ pairCode: deviceCode, appUrl, expiresInSeconds: SETUP_TTL_MS / 1000 }, 201);
});
