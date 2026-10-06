import React from "react";
import { cn } from "@/utils/cn";
import Spinner from "./Spinner";

export interface TimelineStage {
  id: string;
  name: string;
  description?: string;
  status: "queued" | "processing" | "completed" | "failed" | "idle";
}

interface TimelineProps {
  stages: TimelineStage[];
  currentStageId?: string;
  className?: string;
}

export default function Timeline({ stages, currentStageId, className }: TimelineProps) {
  return (
    <div className={cn("space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800", className)}>
      {stages.map((stage, idx) => {
        const isCompleted = stage.status === "completed";
        const isProcessing = stage.status === "processing";
        const isFailed = stage.status === "failed";
        const isQueued = stage.status === "queued";
        
        return (
          <div key={stage.id} className="flex gap-4 relative animate-fade-in-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            {/* Step node */}
            <div className="z-10 flex items-center justify-center">
              <div
                className={cn(
                  "w-7.5 h-7.5 rounded-full flex items-center justify-center border text-xs font-semibold transition-all",
                  {
                    "bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/20": isProcessing,
                    "bg-green-500/15 border-green-500 text-green-400": isCompleted,
                    "bg-red-500/15 border-red-500 text-red-400": isFailed,
                    "bg-zinc-900 border-zinc-700 text-zinc-400": isQueued,
                    "bg-zinc-950 border-zinc-800 text-zinc-650": stage.status === "idle",
                  }
                )}
              >
                {isProcessing ? (
                  <Spinner className="w-3.5 h-3.5 text-indigo-400" />
                ) : isCompleted ? (
                  "✓"
                ) : isFailed ? (
                  "✗"
                ) : (
                  idx + 1
                )}
              </div>
            </div>

            {/* Description */}
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <h4
                  className={cn("text-sm font-semibold transition-colors", {
                    "text-indigo-400": isProcessing,
                    "text-green-400": isCompleted,
                    "text-red-400": isFailed,
                    "text-zinc-200": isQueued,
                    "text-zinc-500": stage.status === "idle",
                  })}
                >
                  {stage.name}
                </h4>
                {isProcessing && (
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded px-1.5 py-0.5 animate-pulse uppercase tracking-wider font-bold">
                    Active
                  </span>
                )}
              </div>
              {stage.description && (
                <p
                  className={cn("text-xs mt-0.5 transition-colors", {
                    "text-zinc-400": isProcessing || isCompleted,
                    "text-zinc-550": isQueued || stage.status === "idle",
                    "text-red-400/80": isFailed,
                  })}
                >
                  {stage.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
