"use client";
import { cn } from "@/lib/utils";

export function ShiningText({
  variant = "text-shimmer",
  text = "Pensando...",
  className
}: {
  variant?: "text-shimmer" | "typing";
  text?: string;
  className?: string;
}) {
  if (variant === "typing") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} aria-label={text}>
        <span className="h-1.5 w-1.5 animate-loading-dot rounded-full bg-current [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-loading-dot rounded-full bg-current [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-loading-dot rounded-full bg-current [animation-delay:240ms]" />
      </span>
    );
  }
  
  return (
    <span
      className={cn(
        // Trocamos 'black' por 'currentColor' nas extremidades
        "inline-block animate-text-shimmer bg-[linear-gradient(110deg,currentColor,45%,var(--primary),55%,currentColor)] bg-[length:250%_100%] bg-clip-text text-sm font-medium text-transparent",
        className
      )}
    >
      {text}
    </span>
  );
}