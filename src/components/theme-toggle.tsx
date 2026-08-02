"use client";

import { useState } from "react";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    /** Definida pelo script de tema em layout.tsx: grava o cookie e aplica a classe "dark" na hora. */
    __setTheme?: (preference: ThemePreference) => void;
  }
}

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "system", label: "Automático", icon: "ti-device-desktop" },
  { value: "light", label: "Claro", icon: "ti-sun" },
  { value: "dark", label: "Escuro", icon: "ti-moon" }
];

export function ThemeToggle({ initialTheme }: { initialTheme: ThemePreference }) {
  const [theme, setTheme] = useState(initialTheme);

  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            setTheme(option.value);
            window.__setTheme?.(option.value);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
            theme === option.value
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]"
          )}
        >
          <i className={cn("ti text-base leading-none", option.icon)} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
