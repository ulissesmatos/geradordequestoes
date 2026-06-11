"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Texto com brilho deslizante (shimmer) animado via motion.
 * Cores adaptadas aos tokens do tema para ficar visível no fundo do chat.
 */
export function ShiningText({ text, className }: { text: string; className?: string }) {
  return (
    <motion.span
      className={cn(
        // Base cinza médio com banda cinza-clara deslizante (mais visível e suave).
        "bg-[linear-gradient(110deg,#94a3b8,35%,#f1f5f9,50%,#94a3b8,75%,#94a3b8)] bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent",
        className
      )}
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "linear"
      }}
    >
      {text}
    </motion.span>
  );
}
