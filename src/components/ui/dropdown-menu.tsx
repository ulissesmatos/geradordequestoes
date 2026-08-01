"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dropdown leve e acessível: fecha ao clicar fora, ao apertar Escape e ao
 * selecionar qualquer item interno (útil para retrair menus no mobile e desktop).
 */
export function DropdownMenu({
  trigger,
  children,
  triggerClassName,
  panelClassName,
  ariaLabel,
  open: openProp,
  onOpenChange
}: {
  trigger: ReactNode;
  children: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
  /** Não controlado por padrão; passe junto com `onOpenChange` para controlar de fora (ex.: manter o gatilho visível enquanto aberto). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const rootRef = useRef<HTMLDivElement>(null);

  function setOpen(value: boolean) {
    setUncontrolledOpen(value);
    onOpenChange?.(value);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cn("animate-fade-in", panelClassName)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
