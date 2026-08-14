"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  children,
  widthClassName = "max-w-md"
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Sobrescreve a largura máxima do painel (padrão max-w-md) — ex.: conteúdo de leitura mais largo. */
  widthClassName?: string;
}) {
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

  // Portal pro body: um Dialog aberto de dentro de um Sheet (drawer mobile) ficava preso
  // dentro do painel deslizante, porque a animação de slide aplica `transform` nele — e
  // `transform` vira containing block de `position: fixed`, então o Dialog não cobria mais a
  // tela inteira. Portal evita isso independente de onde o Dialog é aberto.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className={cn("relative z-10 w-full animate-fade-in", widthClassName)}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogPanel({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  title,
  description,
  onClose
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
      <div>
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-0.5 shrink-0 rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
