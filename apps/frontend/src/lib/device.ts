"use client";

import { useSyncExternalStore } from "react";

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };

/**
 * Budget phones, data-saver mode or a slow connection: show stills instead of live video players.
 * (deviceMemory/connection are Chromium-only; elsewhere this falls back to CPU cores.)
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Nav;
  if (n.connection?.saveData) return true;
  if (n.connection?.effectiveType && /(^|-)2g|3g/.test(n.connection.effectiveType)) return true;
  if (n.deviceMemory !== undefined && n.deviceMemory <= 4) return true;
  return (n.hardwareConcurrency ?? 8) <= 4;
}

const noop = () => () => {};
/** false during SSR and the first paint, so server and client HTML always match */
export const useLowEndDevice = () => useSyncExternalStore(noop, isLowEndDevice, () => false);
