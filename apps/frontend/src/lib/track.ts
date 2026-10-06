import { track as vercelTrack } from "@vercel/analytics";

/** The launch funnel: a video was added → its captions are ready → something was exported. */
export type FunnelEvent = "video_added" | "captions_ready" | "captions_failed" | "export_done" | "export_failed";

/** Custom event for Vercel Web Analytics. Never throws: analytics must not break captioning or exports. */
export function track(event: FunnelEvent, props?: Record<string, string | number | boolean | null>) {
  try {
    vercelTrack(event, props);
  } catch {
    // ignored
  }
}
