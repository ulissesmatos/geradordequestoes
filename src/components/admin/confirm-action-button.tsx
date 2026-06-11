"use client";

import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Botão de ação com window.confirm, para operações sensíveis do admin
 * (pausar/cancelar pacotes, etc.). Envia os `fields` como hidden inputs.
 */
export function ConfirmActionButton({
  action,
  fields,
  confirmMessage,
  variant = "outline",
  children
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirmMessage: string;
  variant?: "outline" | "destructive" | "default";
  children: ReactNode;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirmMessage)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition",
          variant === "destructive" &&
            "bg-[var(--destructive)] text-white hover:opacity-90",
          variant === "outline" &&
            "border border-[var(--border)] hover:bg-[var(--surface-subtle)]",
          variant === "default" &&
            "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]"
        )}
      >
        {children}
      </button>
    </form>
  );
}
