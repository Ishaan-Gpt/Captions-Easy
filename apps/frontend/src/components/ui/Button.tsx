import React from "react";
import { cn } from "@/utils/cn";
import Spinner from "./Spinner";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export default function Button({
  className,
  children,
  variant = "primary",
  size = "md",
  isLoading,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        {
          // Size
          "px-3 py-1.5 text-xs": size === "sm",
          "px-4 py-2.5 text-sm": size === "md",
          "px-6 py-3 text-base": size === "lg",
          
          // Variants
          "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-750 focus:ring-indigo-500 shadow-md shadow-indigo-600/10":
            variant === "primary",
          "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-900 border border-zinc-700/60 focus:ring-zinc-500":
            variant === "secondary",
          "bg-red-650 text-white hover:bg-red-550 active:bg-red-750 focus:ring-red-500":
            variant === "danger",
          "bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 focus:ring-zinc-500":
            variant === "ghost",
        },
        className
      )}
      {...props}
    >
      {isLoading && <Spinner className="w-4 h-4 mr-2" />}
      {children}
    </button>
  );
}
