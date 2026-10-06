import React from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export default function Card({
  className,
  children,
  hoverable = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-6 text-zinc-100",
        {
          "transition-all duration-300 hover:bg-zinc-900/60 hover:border-zinc-700/60 hover:shadow-lg hover:shadow-zinc-950/20":
            hoverable,
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
