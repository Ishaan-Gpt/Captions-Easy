"use client";

import { useSyncExternalStore } from "react";
import { authService } from "@/services/auth";

const noSubscribe = () => () => undefined;

/**
 * Whether a session is stored on this device. Read during render without an effect: false on the server and while
 * hydrating (so the server HTML matches), then the stored session. Pages still redirect from an effect, checking
 * authService.isAuthenticated() directly, so a signed-in user is never sent to /login during hydration.
 */
export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(noSubscribe, () => authService.isAuthenticated(), () => false);
}
