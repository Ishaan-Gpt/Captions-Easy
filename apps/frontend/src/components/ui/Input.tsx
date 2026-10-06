import React from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export default function Input({
  className,
  error,
  label,
  id,
  type = "text",
  disabled,
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-zinc-400 select-none uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        disabled={disabled}
        className={cn(
          "w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-150 rounded-lg text-sm transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-550",
          {
            "border-red-500/80 focus:ring-red-500 focus:border-red-500": error,
          },
          className
        )}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-450 font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
