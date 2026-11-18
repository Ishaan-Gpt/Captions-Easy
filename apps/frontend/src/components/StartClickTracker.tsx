"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/**
 * One listener for every "Start free" link on the site: records which page sent the visitor into the studio, so the
 * search pages can be judged by the studio visits they bring, not only by their page views.
 */
export function StartClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="/start"]');
      if (a) track("start_clicked", { from: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
