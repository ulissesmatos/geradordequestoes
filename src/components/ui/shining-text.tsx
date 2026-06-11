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
        "bg-[linear-gradient(110deg,var(--muted-foreground),35%,var(--primary),50%,var(--muted-foreground),75%,var(--muted-foreground))] bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent",
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
