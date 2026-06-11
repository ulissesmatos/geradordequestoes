"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Lado de onde o painel desliza. */
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
};

/** Drawer off-canvas: overlay + painel deslizante, fecha em Escape/overlay. Parent controla o estado. */
export function Sheet({ open, onClose, side = "left", className, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "absolute inset-y-0 z-10 flex w-72 max-w-[85vw] flex-col overflow-y-auto shadow-[var(--shadow-lg)]",
          side === "left" ? "left-0 animate-slide-in-left" : "right-0 animate-slide-in-right",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
