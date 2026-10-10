"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FoldHorizontal,
  Film,
  Lock,
  Magnet,
  Maximize2,
  Mic,
  MousePointer,
  MoveHorizontal,
  Plus,
  Scissors,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Layers,
  ArrowLeftRight,
} from "lucide-react";
import {
  executeRippleTrim,
  executeRollTrim,
  executeSlipTrim,
  executeSlideTrim,
  findSnapPoint,
  type TimelineClip,
  type TimelineTrack,
  type TrimTool,
} from "./trimmingEngine";

interface Props {
  durationMs: number;
  timeMs: number;
  playing?: boolean;
  onSeek: (ms: number) => void;
  onClipsChange?: (clips: TimelineClip[]) => void;
  initialClips?: TimelineClip[];
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: "C1", name: "Captions", type: "caption", muted: false, solo: false, locked: false },
  { id: "V2", name: "Overlay V2", type: "video", muted: false, solo: false, locked: false },
  { id: "V1", name: "Main Video V1", type: "video", muted: false, solo: false, locked: false },
  { id: "A1", name: "Dialogue A1", type: "audio", muted: false, solo: false, locked: false },
  { id: "A2", name: "Music A2", type: "audio", muted: false, solo: false, locked: false },
];

const DEFAULT_CLIPS: TimelineClip[] = [
  {
    id: "clip-c1",
    trackId: "C1",
    name: "Animated Captions",
    type: "caption",
    startMs: 0,
    endMs: 8000,
    mediaStartMs: 0,
    mediaDurationMs: 8000,
    color: "#8B5CF6",
  },
  {
    id: "clip-v1",
    trackId: "V1",
    name: "Main Camera Shot",
    type: "video",
    startMs: 0,
    endMs: 5000,
    mediaStartMs: 0,
    mediaDurationMs: 12000,
    color: "#3B82F6",
  },
  {
    id: "clip-v2",
    trackId: "V1",
    name: "B-Roll Cutaway",
    type: "video",
    startMs: 5000,
    endMs: 8000,
    mediaStartMs: 1000,
    mediaDurationMs: 6000,
    color: "#06B6D4",
  },
  {
    id: "clip-a1",
    trackId: "A1",
    name: "Vocal Audio",
    type: "audio",
    startMs: 0,
    endMs: 8000,
    mediaStartMs: 0,
    mediaDurationMs: 8000,
    color: "#10B981",
  },
];

const fmtTime = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const f = Math.floor((ms % 1000) / 40); // 25fps frames
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
};

export const EnterpriseTimeline: React.FC<Props> = ({
  durationMs = 10000,
  timeMs = 0,
  playing = false,
  onSeek,
  onClipsChange,
  initialClips,
}) => {
  const [tracks, setTracks] = useState<TimelineTrack[]>(DEFAULT_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>(initialClips || DEFAULT_CLIPS);
  const [activeTool, setActiveTool] = useState<TrimTool>("select");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [snapping, setSnapping] = useState(true);
  const [rippleAll, setRippleAll] = useState(false);
  const [activeTrimInfo, setActiveTrimInfo] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);

  const TRACK_HEADER_W = 160;
  const RULER_H = 28;
  const TRACK_H = 44;

  const totalDuration = Math.max(durationMs, 10000);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setViewW(Math.max(400, el.clientWidth - TRACK_HEADER_W));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pxPerMs = (viewW / totalDuration) * zoom;
  const totalWidthPx = Math.ceil(totalDuration * pxPerMs);
  const x = (ms: number) => ms * pxPerMs;

  const ticks = useMemo(() => {
    const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 30000];
    const step = steps.find((s) => s * pxPerMs >= 80) ?? 60000;
    const out: number[] = [];
    for (let t = 0; t <= totalDuration; t += step) out.push(t);
    return out;
  }, [pxPerMs, totalDuration]);

  // Snapping targets
  const snapTargets = useMemo(() => {
    const targets = [0, totalDuration, timeMs];
    clips.forEach((c) => {
      targets.push(c.startMs, c.endMs);
    });
    return Array.from(new Set(targets));
  }, [clips, timeMs, totalDuration]);

  // Handle Dragging / Trimming Actions
  const dragRef = useRef<{
    clipId: string;
    edge?: "start" | "end" | "middle";
    x0: number;
    clip0: TimelineClip;
    neighborId?: string;
  } | null>(null);

  const startDrag = (
    e: React.PointerEvent,
    clip: TimelineClip,
    edge: "start" | "end" | "middle"
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedClipId(clip.id);

    // Find adjacent clip on same track if doing roll or slide
    const trackClips = clips
      .filter((c) => c.trackId === clip.trackId)
      .sort((a, b) => a.startMs - b.startMs);
    const index = trackClips.findIndex((c) => c.id === clip.id);
    let neighborId: string | undefined;
    if (activeTool === "roll") {
      if (edge === "end" && index < trackClips.length - 1) {
        neighborId = trackClips[index + 1].id;
      } else if (edge === "start" && index > 0) {
        neighborId = trackClips[index - 1].id;
      }
    }

    dragRef.current = {
      clipId: clip.id,
      edge,
      x0: e.clientX,
      clip0: { ...clip },
      neighborId,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { clipId, edge, x0, clip0, neighborId } = dragRef.current;
    const deltaMs = (e.clientX - x0) / pxPerMs;

    let updated = clips;
    let info = "";

    if (activeTool === "select") {
      if (edge === "middle") {
        let newStart = Math.max(0, clip0.startMs + deltaMs);
        if (snapping) {
          const snap = findSnapPoint(newStart, snapTargets, 15 / pxPerMs);
          newStart = snap.snappedTime;
        }
        const len = clip0.endMs - clip0.startMs;
        updated = clips.map((c) =>
          c.id === clipId ? { ...c, startMs: newStart, endMs: newStart + len } : c
        );
        info = `Move to ${fmtTime(newStart)}`;
      } else {
        const rawTime = edge === "start" ? clip0.startMs + deltaMs : clip0.endMs + deltaMs;
        let targetTime = rawTime;
        if (snapping) {
          targetTime = findSnapPoint(rawTime, snapTargets, 15 / pxPerMs).snappedTime;
        }
        updated = clips.map((c) => {
          if (c.id !== clipId) return c;
          if (edge === "start") {
            const start = Math.min(targetTime, c.endMs - 100);
            return { ...c, startMs: start };
          } else {
            const end = Math.max(targetTime, c.startMs + 100);
            return { ...c, endMs: end };
          }
        });
        info = `Trim ${edge} to ${fmtTime(targetTime)}`;
      }
    } else if (activeTool === "ripple") {
      const targetEdge = edge === "middle" ? "end" : edge || "end";
      const targetTime = targetEdge === "start" ? clip0.startMs + deltaMs : clip0.endMs + deltaMs;
      updated = executeRippleTrim(clips, clipId, targetEdge, targetTime, rippleAll);
      info = `Ripple Trim: Delta ${(deltaMs / 1000).toFixed(2)}s`;
    } else if (activeTool === "roll" && neighborId) {
      const targetTime = clip0.endMs + deltaMs;
      updated = executeRollTrim(clips, clipId, neighborId, targetTime);
      info = `Roll Edit: Boundary ${fmtTime(targetTime)}`;
    } else if (activeTool === "slip") {
      updated = executeSlipTrim(clips, clipId, deltaMs);
      info = `Slip Media Offset: ${(deltaMs / 1000).toFixed(2)}s`;
    } else if (activeTool === "slide") {
      const newStart = clip0.startMs + deltaMs;
      updated = executeSlideTrim(clips, clipId, newStart);
      info = `Slide Position: ${fmtTime(newStart)}`;
    }

    setClips(updated);
    setActiveTrimInfo(info);
    if (onClipsChange) onClipsChange(updated);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setActiveTrimInfo(null);
  };

  const addTrack = (type: "video" | "audio") => {
    const count = tracks.filter((t) => t.type === type).length + 1;
    const newId = `${type === "video" ? "V" : "A"}${count + 1}`;
    const newTrack: TimelineTrack = {
      id: newId,
      name: `${type === "video" ? "Video" : "Audio"} Track ${newId}`,
      type,
      muted: false,
      solo: false,
      locked: false,
    };
    setTracks([newTrack, ...tracks]);
  };

  const toggleTrackMute = (id: string) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
  };

  const toggleTrackLock = (id: string) => {
    setTracks(tracks.map((t) => (t.id === id ? { ...t, locked: !t.locked } : t)));
  };

  const toolButton = (
    tool: TrimTool,
    label: string,
    icon: React.ReactNode,
    shortcut: string
  ) => (
    <button
      onClick={() => setActiveTool(tool)}
      title={`${label} (${shortcut})`}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
        activeTool === tool
          ? "bg-emerald-500 text-black shadow"
          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
      <kbd className="ml-1 rounded bg-neutral-900/60 px-1 text-[10px] text-neutral-400">
        {shortcut}
      </kbd>
    </button>
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full select-none flex-col border-t border-neutral-800 bg-neutral-950 font-sans text-white"
      onPointerUp={handlePointerUp}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs">
        {/* Tool Modes */}
        <div className="flex items-center gap-1">
          {toolButton("select", "Selection", <MousePointer className="h-3.5 w-3.5" />, "V")}
          {toolButton("razor", "Razor", <Scissors className="h-3.5 w-3.5" />, "C")}
          {toolButton("ripple", "Ripple Trim", <FoldHorizontal className="h-3.5 w-3.5" />, "B")}
          {toolButton("roll", "Roll Edit", <MoveHorizontal className="h-3.5 w-3.5" />, "N")}
          {toolButton("slip", "Slip Media", <ArrowLeftRight className="h-3.5 w-3.5" />, "Y")}
          {toolButton("slide", "Slide Track", <Layers className="h-3.5 w-3.5" />, "U")}
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-3">
          {activeTrimInfo && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-300 border border-amber-500/40 animate-pulse">
              {activeTrimInfo}
            </span>
          )}

          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
            <button
              onClick={() => setSnapping(!snapping)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
                snapping ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              <Magnet className="h-3.5 w-3.5" />
              <span>Snap</span>
            </button>
            <button
              onClick={() => setRippleAll(!rippleAll)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition ${
                rippleAll ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Ripple All</span>
            </button>
          </div>

          {/* Add Tracks */}
          <div className="flex items-center gap-1 border-l border-neutral-800 pl-3">
            <button
              onClick={() => addTrack("video")}
              className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              <Plus className="h-3 w-3" />
              <Film className="h-3 w-3" />
              <span>Track</span>
            </button>
            <button
              onClick={() => addTrack("audio")}
              className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              <Plus className="h-3 w-3" />
              <Mic className="h-3 w-3" />
              <span>Track</span>
            </button>
          </div>

          {/* Timecode & Zoom */}
          <div className="flex items-center gap-2 border-l border-neutral-800 pl-3 font-mono">
            <span className="rounded bg-neutral-900 px-2 py-1 text-emerald-400 font-bold border border-neutral-800">
              {fmtTime(timeMs)}
            </span>
            <span className="text-neutral-500">/ {fmtTime(totalDuration)}</span>
          </div>

          <div className="flex items-center gap-1 border-l border-neutral-800 pl-3">
            <button
              onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={1}
              max={30}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-emerald-500"
            />
            <button
              onClick={() => setZoom((z) => Math.min(30, z * 1.5))}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Multi-Track Canvas */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Track Headers */}
        <div
          className="flex shrink-0 flex-col border-r border-neutral-800 bg-neutral-900"
          style={{ width: TRACK_HEADER_W }}
        >
          <div
            className="flex items-center border-b border-neutral-800 bg-neutral-950 px-3 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase"
            style={{ height: RULER_H }}
          >
            Tracks ({tracks.length})
          </div>
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center justify-between border-b border-neutral-800/80 px-2.5 text-xs text-neutral-300"
              style={{ height: TRACK_H }}
            >
              <div className="flex items-center gap-2 truncate">
                {track.type === "video" && <Film className="h-3.5 w-3.5 text-blue-400" />}
                {track.type === "audio" && <Mic className="h-3.5 w-3.5 text-emerald-400" />}
                {track.type === "caption" && <SlidersHorizontal className="h-3.5 w-3.5 text-purple-400" />}
                <span className="font-medium truncate">{track.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleTrackMute(track.id)}
                  className={`rounded p-1 transition ${
                    track.muted ? "bg-red-500/20 text-red-400" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => toggleTrackLock(track.id)}
                  className={`rounded p-1 transition ${
                    track.locked ? "bg-amber-500/20 text-amber-400" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <Lock className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right Scrollable Tracks Area */}
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-neutral-950"
          onPointerMove={handlePointerMove}
        >
          <div
            className="relative"
            style={{
              width: totalWidthPx,
              height: RULER_H + tracks.length * TRACK_H,
            }}
          >
            {/* Time Ruler */}
            <div
              className="relative cursor-pointer border-b border-neutral-800 bg-neutral-900"
              style={{ height: RULER_H }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ms = Math.max(0, (e.clientX - rect.left) / pxPerMs);
                onSeek(ms);
              }}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-full border-l border-neutral-800 pl-1 text-[10px] font-mono text-neutral-500"
                  style={{ left: x(t) }}
                >
                  {fmtTime(t)}
                </div>
              ))}
            </div>

            {/* Track Lanes */}
            {tracks.map((track, idx) => {
              const topPx = RULER_H + idx * TRACK_H;
              const trackClips = clips.filter((c) => c.trackId === track.id);

              return (
                <div
                  key={track.id}
                  className={`absolute left-0 right-0 border-b border-neutral-800/60 ${
                    track.muted ? "opacity-40" : ""
                  }`}
                  style={{ top: topPx, height: TRACK_H }}
                >
                  {trackClips.map((clip) => {
                    const leftPx = x(clip.startMs);
                    const widthPx = Math.max(8, x(clip.endMs) - x(clip.startMs));
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <div
                        key={clip.id}
                        onPointerDown={(e) => startDrag(e, clip, "middle")}
                        onClick={() => setSelectedClipId(clip.id)}
                        className={`absolute top-1 bottom-1 flex cursor-grab items-center justify-between rounded border px-2 text-xs font-semibold transition ${
                          isSelected
                            ? "border-white ring-2 ring-emerald-400 shadow-lg z-10"
                            : "border-black/30 hover:border-white/50"
                        }`}
                        style={{
                          left: leftPx,
                          width: widthPx,
                          backgroundColor: clip.color || "#3B82F6",
                        }}
                      >
                        {/* Trim Drag Handles */}
                        <div
                          onPointerDown={(e) => startDrag(e, clip, "start")}
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-black/20 hover:bg-white/40"
                        />
                        <span className="truncate text-white drop-shadow-sm">
                          {clip.name}
                        </span>
                        <div
                          onPointerDown={(e) => startDrag(e, clip, "end")}
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/20 hover:bg-white/40"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Playhead Marker */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              style={{ left: x(timeMs) }}
            >
              <div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 bg-red-500 shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
