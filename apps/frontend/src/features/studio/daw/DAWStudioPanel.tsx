"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Clock,
  Disc,
  FastForward,
  Gauge,
  Sliders,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { MasterAudioClock } from "./masterAudioClock";
import { AudioTrackConfig, DAWAudioEngine, EQBand, LufsMetrics } from "./dawAudioEngine";
import { InterpolationMode, SpeedKeyframe, TimeRemappingEngine } from "./timeRemappingEngine";

export const DAWStudioPanel: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  const [timelineMs, setTimelineMs] = useState(0);
  const [sampleRate, setSampleRate] = useState(48000);
  const [samplePos, setSamplePos] = useState(0);

  // LUFS Metrics State
  const [lufs, setLufs] = useState<LufsMetrics>({
    momentaryLufs: -18.5,
    shortTermLufs: -16.2,
    integratedLufs: -14.0, // EBU R128 Broadcast Target (-24 LUFS / -14 Spotify)
    truePeakDb: -1.2,
  });

  // Speed Ramping & Remapping State
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [interpMode, setInterpMode] = useState<InterpolationMode>("opticalFlow");
  const [pitchCorrection, setPitchCorrection] = useState(true);

  // Audio Tracks Configuration
  const [tracks, setTracks] = useState<AudioTrackConfig[]>([
    {
      id: "a1",
      name: "Dialogue A1",
      volumeDb: 0,
      pan: 0,
      busId: "bus1",
      muted: false,
      solo: false,
      eqBands: [
        { type: "lowshelf", frequency: 100, gainDb: -3, q: 0.7 },
        { type: "peaking", frequency: 2500, gainDb: 4, q: 1.2 },
        { type: "highshelf", frequency: 10000, gainDb: 2, q: 0.7 },
      ],
      compressor: { thresholdDb: -20, ratio: 3.5, attackMs: 15, releaseMs: 120, kneeDb: 6 },
    },
    {
      id: "a2",
      name: "Music / Score A2",
      volumeDb: -6,
      pan: -0.2,
      busId: "bus1",
      muted: false,
      solo: false,
      eqBands: [
        { type: "lowshelf", frequency: 80, gainDb: 2, q: 0.7 },
        { type: "peaking", frequency: 1000, gainDb: -2, q: 1.0 },
      ],
      compressor: { thresholdDb: -15, ratio: 2.0, attackMs: 30, releaseMs: 200, kneeDb: 3 },
    },
    {
      id: "a3",
      name: "SFX & Foley A3",
      volumeDb: -3,
      pan: 0.3,
      busId: "bus2",
      muted: false,
      solo: false,
      eqBands: [{ type: "peaking", frequency: 4000, gainDb: 3, q: 1.5 }],
      compressor: { thresholdDb: -12, ratio: 4.0, attackMs: 5, releaseMs: 80, kneeDb: 2 },
    },
  ]);

  const clockRef = useRef<MasterAudioClock>(new MasterAudioClock());
  const dawRef = useRef<DAWAudioEngine>(new DAWAudioEngine());
  const remappingRef = useRef<TimeRemappingEngine>(new TimeRemappingEngine());
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void clockRef.current.init().then(() => {
      setSampleRate(clockRef.current.getSampleRate());
    });
  }, []);

  // Audio Clock Update Loop
  useEffect(() => {
    let animId: number;
    const update = () => {
      const currentMs = clockRef.current.getCurrentTimelineMs();
      setTimelineMs(currentMs);
      setSamplePos(clockRef.current.getCurrentSamplePosition());

      // Simulate live LUFS fluctuation during playback
      if (clockRef.current.isPlaying()) {
        const noise = (Math.random() - 0.5) * 2;
        setLufs((prev) => ({
          momentaryLufs: Math.max(-70, Math.min(0, -18.5 + noise * 3)),
          shortTermLufs: Math.max(-70, Math.min(0, -16.2 + noise * 1.5)),
          integratedLufs: -14.0,
          truePeakDb: Math.max(-100, Math.min(6, -1.2 + Math.abs(noise) * 0.5)),
        }));
      }

      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Render 5-Band EQ Frequency Response Curve
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    // Draw Grid Lines (20Hz, 100Hz, 1kHz, 10kHz)
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    [20, 100, 1000, 10000, 20000].forEach((freq) => {
      const x = (Math.log10(freq / 20) / Math.log10(20000 / 20)) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });

    // 0dB Center Line
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw EQ Curve for Track 1
    const track = tracks[0];
    if (track) {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      for (let x = 0; x < w; x++) {
        const freqRatio = Math.pow(20000 / 20, x / w);
        const freq = 20 * freqRatio;
        const gainDb = dawRef.current.evaluateEqResponse(track.eqBands, freq);
        const y = h / 2 - (gainDb / 24) * (h / 2);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [tracks]);

  const togglePlay = () => {
    if (playing) {
      clockRef.current.pause();
      setPlaying(false);
    } else {
      clockRef.current.play(timelineMs, speedMultiplier);
      setPlaying(true);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden">
      {/* Top Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span className="font-mono text-sm font-bold tracking-wide">
            Phase 6 • DAW & Sub-Frame Master Audio Synchronization
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="flex items-center gap-1.5 text-neutral-300">
            <Clock className="h-3.5 w-3.5 text-emerald-400" />
            {(timelineMs / 1000).toFixed(3)}s
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">
            Sample: {samplePos.toLocaleString()} @ {sampleRate / 1000}kHz
          </span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 p-4 overflow-y-auto">
        {/* Left Column: Audio Tracks Console & EQ Curve */}
        <div className="flex flex-col space-y-4">
          {/* Section 1: 5-Band Parametric EQ Visualizer */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2 text-xs font-mono font-semibold text-emerald-400">
              <span className="flex items-center gap-2">
                <Sliders className="h-3.5 w-3.5" /> 5-Band Parametric EQ Transfer Curve (Dialogue A1)
              </span>
              <span className="text-neutral-400">20Hz - 20kHz • ±24dB</span>
            </div>
            <canvas ref={eqCanvasRef} width={800} height={180} className="w-full rounded border border-neutral-800 block" />
          </div>

          {/* Section 2: Multi-Track Console */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2 text-xs font-mono font-semibold text-emerald-400">
              <span className="flex items-center gap-2">
                <Disc className="h-3.5 w-3.5" /> Multi-Track DAW Mixer Console
              </span>
              <span className="text-neutral-400">{tracks.length} Active Audio Tracks</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tracks.map((track, idx) => (
                <div key={track.id} className="rounded border border-neutral-800 bg-neutral-950 p-3 space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-200">{track.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const updated = [...tracks];
                          updated[idx].muted = !updated[idx].muted;
                          setTracks(updated);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${track.muted ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-400"}`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => {
                          const updated = [...tracks];
                          updated[idx].solo = !updated[idx].solo;
                          setTracks(updated);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${track.solo ? "bg-amber-500/20 text-amber-400" : "bg-neutral-800 text-neutral-400"}`}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Fader Gain:</span>
                      <span className="text-emerald-400 font-bold">{track.volumeDb > 0 ? `+${track.volumeDb}` : track.volumeDb} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-36}
                      max={12}
                      step={0.5}
                      value={track.volumeDb}
                      onChange={(e) => {
                        const updated = [...tracks];
                        updated[idx].volumeDb = Number(e.target.value);
                        setTracks(updated);
                      }}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Pan:</span>
                      <span>{track.pan < 0 ? `L ${Math.abs(track.pan * 100)}%` : track.pan > 0 ? `R ${Math.abs(track.pan * 100)}%` : "Center"}</span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={track.pan}
                      onChange={(e) => {
                        const updated = [...tracks];
                        updated[idx].pan = Number(e.target.value);
                        setTracks(updated);
                      }}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: EBU R128 LUFS Metering & Speed Ramping Inspector */}
        <div className="flex flex-col space-y-4">
          {/* Section 1: EBU R128 / ITU-R BS.1770-4 LUFS Loudness Meter */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 font-semibold text-emerald-400">
              <Gauge className="h-4 w-4" /> EBU R128 Loudness Compliance
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] text-neutral-400">
                  <span>Integrated LUFS:</span>
                  <span className="text-emerald-300 font-bold">{lufs.integratedLufs.toFixed(1)} LUFS</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden mt-1">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, (lufs.integratedLufs + 70) * (100 / 70))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400">
                  <span>Short-Term (3s):</span>
                  <span className="text-emerald-400">{lufs.shortTermLufs.toFixed(1)} LUFS</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden mt-1">
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.max(0, (lufs.shortTermLufs + 70) * (100 / 70))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400">
                  <span>True Peak:</span>
                  <span className={lufs.truePeakDb > 0 ? "text-red-400 font-bold" : "text-emerald-400"}>
                    {lufs.truePeakDb.toFixed(1)} dBFS
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden mt-1">
                  <div className={`h-full ${lufs.truePeakDb > 0 ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${Math.max(0, (lufs.truePeakDb + 100) * (100 / 106))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Variable Speed Ramping & Optical Flow Settings */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 font-semibold text-emerald-400">
              <FastForward className="h-4 w-4" /> Variable Speed Ramping & WSOLA
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-neutral-300">
                <span>Speed Multiplier:</span>
                <span className="font-bold text-emerald-400">{(speedMultiplier * 100).toFixed(0)}% ({speedMultiplier.toFixed(2)}x)</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={5.0}
                step={0.1}
                value={speedMultiplier}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSpeedMultiplier(val);
                  clockRef.current.setPlaybackRate(val);
                }}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-400">Video Frame Interpolation</label>
              <select
                value={interpMode}
                onChange={(e) => setInterpMode(e.target.value as InterpolationMode)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 outline-none text-neutral-200"
              >
                <option value="opticalFlow">Optical Flow (WebGPU AI Motion Vectors)</option>
                <option value="frameBlend">Frame Blending (Crossfade)</option>
                <option value="nearest">Nearest Neighbor (Rigid)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
              <span className="text-neutral-300">WSOLA Audio Pitch Preservation</span>
              <button
                onClick={() => setPitchCorrection(!pitchCorrection)}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  pitchCorrection ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-neutral-800 text-neutral-500"
                }`}
              >
                {pitchCorrection ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
