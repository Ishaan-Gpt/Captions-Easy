"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Layers,
  Sparkles,
  Type,
  Video,
  Zap,
  Sliders,
  Maximize,
  Play,
  Pause,
  Grid,
} from "lucide-react";
import {
  calculateSMPTESafeZones,
  evaluateKineticTypography,
  interpolate,
  KineticTokenTransform,
  spring,
} from "./motionGraphicsEngine";
import {
  evaluateLayerTransformAtFrame,
  TrackLayerConfig,
  WebGPUCompositorEngine,
} from "../compositing/compositorEngine";
import { BlendMode } from "../compositing/wgslShaders";
import { GeneratorClipEngine, MaskingEngine } from "../compositing/mediaMaskingEngine";

export const MotionCompositorStudio: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(60);
  const [executionMs, setExecutionMs] = useState(1.8);
  const [showSafeZones, setShowSafeZones] = useState(true);

  // Kinetic Typography Controls
  const [inputText, setInputText] = useState("DYNAMIC MOTION GRAPHICS");
  const [staggerMode, setStaggerMode] = useState<"character" | "word" | "line">("word");
  const [staggerDelay, setStaggerDelay] = useState(4);
  const [springMass, setSpringMass] = useState(1);
  const [springStiffness, setSpringStiffness] = useState(140);
  const [springDamping, setSpringDamping] = useState(12);

  // Layer Configuration State
  const [layers, setLayers] = useState<TrackLayerConfig[]>([
    {
      id: "v1",
      name: "Video Track V1",
      type: "video",
      blendMode: "normal",
      visible: true,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        anchorPoint: { x: 0, y: 0 },
        rotation: 0,
        opacity: 1,
      },
    },
    {
      id: "gen1",
      name: "SMPTE Color Bars Generator",
      type: "generator",
      blendMode: "overlay",
      visible: true,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        anchorPoint: { x: 0, y: 0 },
        rotation: 0,
        opacity: 0.35,
      },
    },
    {
      id: "text1",
      name: "Kinetic Typography Overlay",
      type: "text",
      blendMode: "screen",
      visible: true,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        anchorPoint: { x: 0, y: 0 },
        rotation: 0,
        opacity: 1,
      },
      keyframeTracks: {
        rotation: [
          { frame: 0, value: -5, easing: "easeInOut" },
          { frame: 60, value: 5, easing: "easeInOut" },
          { frame: 120, value: -5 },
        ],
      },
    },
  ]);

  const compositorRef = useRef<WebGPUCompositorEngine>(new WebGPUCompositorEngine());

  useEffect(() => {
    compositorRef.current.setLayers(layers);
  }, [layers]);

  // Frame Render Loop (Sub-16ms budget)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      if (playing) {
        setCurrentFrame((prev) => (prev + 1) % 180);
      }

      const passResult = compositorRef.current.renderFramePass(currentFrame, 60);
      setExecutionMs(passResult.executionDurationMs);

      // Draw Canvas Preview
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          // Base background
          ctx.fillStyle = "#0a0a0c";
          ctx.fillRect(0, 0, w, h);

          // Draw Simulated Multi-Track Video & Overlays
          // Layer 1: Simulated background video pulse
          ctx.fillStyle = "#1e1b4b";
          ctx.fillRect(0, 0, w, h);

          // Layer 2: SMPTE Generator overlay simulation
          if (layers[1]?.visible) {
            ctx.save();
            ctx.globalAlpha = layers[1].transform.opacity;
            const barW = w / 7;
            const barColors = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
            barColors.forEach((col, i) => {
              ctx.fillStyle = col;
              ctx.fillRect(i * barW, 0, barW, h);
            });
            ctx.restore();
          }

          // Layer 3: Kinetic Typography Evaluation
          if (layers[2]?.visible) {
            ctx.save();
            const evaluatedTransform = evaluateLayerTransformAtFrame(layers[2], currentFrame);
            const tokens = evaluateKineticTypography(currentFrame, {
              text: inputText,
              staggerMode,
              staggerDelayFrames: staggerDelay,
              springConfig: { mass: springMass, stiffness: springStiffness, damping: springDamping },
            });

            ctx.translate(w / 2, h / 2);
            ctx.rotate((evaluatedTransform.rotation * Math.PI) / 180);

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 44px Inter, sans-serif";

            tokens.forEach((t, i) => {
              ctx.save();
              const offset = (i - (tokens.length - 1) / 2) * 55;
              ctx.translate(0, offset + t.translateY);
              ctx.scale(t.scale, t.scale);
              ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));

              // Scrim pill backdrop
              ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
              const metrics = ctx.measureText(t.text);
              ctx.beginPath();
              ctx.roundRect(-metrics.width / 2 - 16, -24, metrics.width + 32, 48, 24);
              ctx.fill();

              // Text
              ctx.fillStyle = "#10b981";
              ctx.fillText(t.text, 0, 0);
              ctx.restore();
            });

            ctx.restore();
          }

          // SMPTE Safe-Zone Overlays (80% Title Safe, 90% Action Safe)
          if (showSafeZones) {
            const zones = calculateSMPTESafeZones(w, h);
            ctx.strokeStyle = "rgba(239, 68, 68, 0.6)"; // 80% Title safe red line
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(zones.titleSafe.x, zones.titleSafe.y, zones.titleSafe.width, zones.titleSafe.height);

            ctx.strokeStyle = "rgba(245, 158, 11, 0.6)"; // 90% Action safe yellow line
            ctx.strokeRect(zones.actionSafe.x, zones.actionSafe.y, zones.actionSafe.width, zones.actionSafe.height);
            ctx.setLineDash([]);
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [playing, currentFrame, layers, inputText, staggerMode, staggerDelay, springMass, springStiffness, springDamping, showSafeZones]);

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden">
      {/* Top Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="font-mono text-sm font-bold tracking-wide">
            Phase 5 • Visual Compositing & Motion Graphics Engine
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400 border border-emerald-500/20">
            <Zap className="h-3 w-3 animate-pulse" /> Sub-16ms: {executionMs.toFixed(2)} ms
          </span>
          <span className="text-neutral-400">Frame: {currentFrame} / 180</span>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Left: Canvas Player & Timeline Transport */}
        <div className="flex flex-col items-center justify-center border-r border-neutral-800 bg-black p-4 relative">
          {/* Overlay Badges */}
          <div className="absolute top-6 left-6 z-10 flex gap-2">
            <button
              onClick={() => setShowSafeZones(!showSafeZones)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono backdrop-blur transition ${
                showSafeZones
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                  : "border-neutral-700 bg-neutral-900/80 text-neutral-400"
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              SMPTE Safe Zones {showSafeZones ? "(On)" : "(Off)"}
            </button>
          </div>

          {/* WebGPU Canvas */}
          <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl aspect-video w-full max-w-4xl">
            <canvas ref={canvasRef} width={1280} height={720} className="h-full w-full block" />
          </div>

          {/* Transport Controls */}
          <div className="mt-4 flex w-full max-w-2xl items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 font-mono text-xs">
            <button
              onClick={() => setPlaying(!playing)}
              className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-black hover:bg-emerald-400 transition"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={180}
              value={currentFrame}
              onChange={(e) => setCurrentFrame(Number(e.target.value))}
              className="min-w-0 flex-1 accent-emerald-500"
            />
            <span className="text-neutral-400">
              {(currentFrame / 60).toFixed(2)}s (60 FPS)
            </span>
          </div>
        </div>

        {/* Right: Controls Inspector */}
        <div className="flex flex-col border-l border-neutral-800 bg-neutral-900/40 p-4 space-y-6 overflow-y-auto">
          {/* Section 1: Kinetic Typography Controls */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 text-sm font-semibold text-emerald-400">
              <Type className="h-4 w-4" /> Kinetic Typography & Remotion Engine
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-neutral-400">Text Prompt</label>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-neutral-400">Stagger Mode</label>
                <select
                  value={staggerMode}
                  onChange={(e) => setStaggerMode(e.target.value as any)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs outline-none"
                >
                  <option value="character">Character</option>
                  <option value="word">Word</option>
                  <option value="line">Line</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-mono text-neutral-400">Stagger Delay ({staggerDelay}f)</label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={staggerDelay}
                  onChange={(e) => setStaggerDelay(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* Spring Physical Parameters */}
            <div className="space-y-2 pt-2 border-t border-neutral-800/80">
              <span className="text-[11px] font-mono text-neutral-400 font-semibold">Spring Physics (Mass / Stiffness / Damping)</span>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div>
                  <span>Mass: {springMass}</span>
                  <input type="range" min={0.5} max={5} step={0.5} value={springMass} onChange={(e) => setSpringMass(Number(e.target.value))} className="w-full accent-emerald-500" />
                </div>
                <div>
                  <span>Stiffness: {springStiffness}</span>
                  <input type="range" min={50} max={300} step={10} value={springStiffness} onChange={(e) => setSpringStiffness(Number(e.target.value))} className="w-full accent-emerald-500" />
                </div>
                <div>
                  <span>Damping: {springDamping}</span>
                  <input type="range" min={5} max={30} step={1} value={springDamping} onChange={(e) => setSpringDamping(Number(e.target.value))} className="w-full accent-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Multi-Track WGSL Layer Stack */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 text-sm font-semibold text-emerald-400">
              <Layers className="h-4 w-4" /> Multi-Track Compositor Layers & WGSL Blend Modes
            </div>

            <div className="space-y-2">
              {layers.map((layer, idx) => (
                <div key={layer.id} className="rounded border border-neutral-800 bg-neutral-950 p-2.5 text-xs space-y-2">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-neutral-200">{layer.name}</span>
                    <button
                      onClick={() => {
                        const updated = [...layers];
                        updated[idx].visible = !updated[idx].visible;
                        setLayers(updated);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] ${layer.visible ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-500"}`}
                    >
                      {layer.visible ? "Visible" : "Hidden"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <span className="text-neutral-500">WGSL Blend:</span>
                      <select
                        value={layer.blendMode}
                        onChange={(e) => {
                          const updated = [...layers];
                          updated[idx].blendMode = e.target.value as BlendMode;
                          setLayers(updated);
                        }}
                        className="w-full rounded border border-neutral-800 bg-neutral-800 px-1 py-0.5 text-neutral-300 outline-none"
                      >
                        <option value="normal">Normal</option>
                        <option value="premultiplied">Premultiplied</option>
                        <option value="multiply">Multiply</option>
                        <option value="screen">Screen</option>
                        <option value="overlay">Overlay</option>
                        <option value="darken">Darken</option>
                        <option value="lighten">Lighten</option>
                        <option value="colorDodge">Color Dodge</option>
                        <option value="difference">Difference</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-neutral-500">Opacity: {Math.round(layer.transform.opacity * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.transform.opacity}
                        onChange={(e) => {
                          const updated = [...layers];
                          updated[idx].transform.opacity = Number(e.target.value);
                          setLayers(updated);
                        }}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
