import * as Sentry from "@sentry/nextjs";

// Browser errors and slow pages -> Sentry. Off when no DSN is set (local dev without the Vercel env).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // a short video of what the user did, only for sessions that hit an error (free plan friendly)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: true })],
  ignoreErrors: ["ResizeObserver loop", "AbortError", "Stopped.", "Upload cancelled"],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
