import * as Sentry from "@sentry/nextjs";

const options = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
};

/** Server and edge errors -> Sentry (API routes, server rendering, cron). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(options);
}

export const onRequestError = Sentry.captureRequestError;
