"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/features/studio/controls";

/**
 * The project's captions are saved, but its video lives on the device it was added from. Picking the same file
 * here brings the project back on this device; nothing is uploaded.
 */
export const ReattachPanel: React.FC<{ filename: string | null; durationMs: number | null; onPick: (file: File) => Promise<void>; onReplace: () => void }> = ({ filename, durationMs, onPick, onReplace }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      if (durationMs) {
        const ms = await durationOf(file);
        if (ms !== null && Math.abs(ms - durationMs) > 1500) {
          setError(`That video is ${fmt(ms)} long, but this project's video is ${fmt(durationMs)}. Pick the same video, or use "Start over with a new video".`);
          return;
        }
      }
      await onPick(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that video.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-3xl">📂</div>
        <h2 className="text-lg font-semibold">Select your video to continue</h2>
        <p className="mt-2 text-sm text-st-muted">
          Your captions and edits are saved. Videos stay on the device you added them from, so pick the same video
          {filename ? <> (<b className="text-st-text">{filename}</b>)</> : null} on this device to keep editing. Nothing is uploaded.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2">
          <Button tone="primary" className="!px-5 !py-2.5" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Opening…" : "Choose the video"}</Button>
          <Button onClick={onReplace} disabled={busy}>Start over with a new video</Button>
        </div>
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        {error ? <p role="alert" className="mt-4 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
      </div>
    </div>
  );
};

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (ms: number | null) => { URL.revokeObjectURL(url); resolve(ms); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}
