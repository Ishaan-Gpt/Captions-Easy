"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioData } from "@/services/studio";
import { getLocalVideo, saveLocalVideo } from "./localVideos";

type ServerVideo = NonNullable<StudioData["video"]>;
export type DeviceVideoStatus = "none" | "loading" | "ready" | "missing";

/**
 * The project's video as this browser can play it: the copy saved on this device (IndexedDB) first, then a
 * server URL for older uploads that still exist. "missing" means neither is available (another device, cleared
 * browser data, or an old upload that was cleaned up): the user picks the same file again and editing continues.
 */
export function useDeviceVideo(server: ServerVideo | null) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const id = server?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let url: string | null = null;
    void getLocalVideo(id).then((blob) => {
      if (!alive) return;
      url = blob ? URL.createObjectURL(blob) : null;
      setLocalUrl(url);
      setChecked(id);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  /** the user picked the file again on this device */
  const attach = useCallback(
    async (file: File) => {
      if (!id) return;
      await saveLocalVideo(id, file);
      setLocalUrl(URL.createObjectURL(file));
      setChecked(id);
    },
    [id],
  );

  const status: DeviceVideoStatus = !server ? "none" : checked !== id ? "loading" : localUrl || server.url ? "ready" : "missing";
  const video: ServerVideo | null = server ? { ...server, url: localUrl ?? server.url } : null;
  return { video, status, attach };
}
