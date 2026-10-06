/** Throws on purpose so we can see a server error arrive in Sentry. Locked behind CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  throw new Error("Sentry test: deliberate server error from /api/cron/sentry-test");
}
