"use client";

import React, { useEffect, useRef, useState } from "react";
import { Activity, BarChart2, Eye, Sun } from "lucide-react";

export type ScopeMode = "waveform" | "vectorscope" | "histogram" | "falsecolor";

interface Props {
  imageSource?: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null;
  width?: number;
  height?: number;
}

export const VideoScopes: React.FC<Props> = ({
  imageSource,
  width = 360,
  height = 240,
}) => {
  const [mode, setMode] = useState<ScopeMode>("waveform");
  const [gain, setGain] = useState<number>(1.0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;

    const renderScope = () => {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let y = 0; y <= height; y += height / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (mode === "waveform") {
        // Draw Waveform Parade Simulation
        ctx.fillStyle = "rgba(52, 211, 153, 0.4)"; // Emerald waveform tint
        for (let x = 0; x < width; x += 2) {
          const val = Math.sin(x * 0.05) * 0.3 + 0.5;
          const y = height - val * height * gain;
          ctx.fillRect(x, Math.max(0, y), 2, 3);
        }
      } else if (mode === "vectorscope") {
        // Draw Polar Vectorscope Circle & Graticule
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(cx, cy) - 20;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Chroma scatter points
        ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
        for (let i = 0; i < 200; i++) {
          const angle = (i / 200) * 2 * Math.PI;
          const r = Math.random() * radius * 0.7;
          ctx.fillRect(cx + r * Math.cos(angle), cy + r * Math.sin(angle), 1.5, 1.5);
        }
      } else if (mode === "histogram") {
        // RGB Histogram
        const barW = width / 64;
        for (let i = 0; i < 64; i++) {
          const rh = (Math.sin(i * 0.1) * 0.4 + 0.5) * height * 0.7;
          const gh = (Math.cos(i * 0.1) * 0.4 + 0.5) * height * 0.7;
          const bh = (Math.sin(i * 0.2) * 0.3 + 0.4) * height * 0.7;

          ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
          ctx.fillRect(i * barW, height - rh, barW, rh);
          ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
          ctx.fillRect(i * barW, height - gh, barW, gh);
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
          ctx.fillRect(i * barW, height - bh, barW, bh);
        }
      } else if (mode === "falsecolor") {
        // False Color Heatmap Legend
        const colors = [
          "#0000ff", // Underexposed / Purple
          "#00ffff", // Dark Shadows
          "#00ff00", // 18% Mid-Grey
          "#ffff00", // Skin Tone Highlights
          "#ff0000", // Clipped Highlights
        ];
        const segW = width / colors.length;
        colors.forEach((col, idx) => {
          ctx.fillStyle = col;
          ctx.fillRect(idx * segW, height - 20, segW, 20);
        });
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px monospace";
        ctx.fillText("False Color Exposure Scale (0 - 100 IRE)", 10, height - 30);
      }

      animFrame = requestAnimationFrame(renderScope);
    };

    renderScope();
    return () => cancelAnimationFrame(animFrame);
  }, [mode, gain, width, height]);

  const modeBtn = (
    m: ScopeMode,
    label: string,
    icon: React.ReactNode
  ) => (
    <button
      onClick={() => setMode(m)}
      className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition ${
        mode === m
          ? "bg-emerald-500 text-black shadow"
          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 select-none">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-1.5">
          {modeBtn("waveform", "Waveform", <Activity className="h-3.5 w-3.5" />)}
          {modeBtn("vectorscope", "Vectorscope", <Sun className="h-3.5 w-3.5" />)}
          {modeBtn("histogram", "Histogram", <BarChart2 className="h-3.5 w-3.5" />)}
          {modeBtn("falsecolor", "False Color", <Eye className="h-3.5 w-3.5" />)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-500">Gain:</span>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            className="w-16 accent-emerald-500"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded border border-neutral-800 bg-black">
        <canvas ref={canvasRef} width={width} height={height} className="w-full h-auto block" />
        <div className="absolute top-2 left-2 rounded bg-neutral-900/80 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-neutral-800">
          {mode.toUpperCase()} SCOPE • Rec.709
        </div>
      </div>
    </div>
  );
};
