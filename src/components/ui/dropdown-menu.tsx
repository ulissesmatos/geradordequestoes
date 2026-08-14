"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  onOpenChange,
  portal = false
}: {
  trigger: ReactNode;
  children: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
  /** Não controlado por padrão; passe junto com `onOpenChange` para controlar de fora (ex.: manter o gatilho visível enquanto aberto). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Renderiza o painel em document.body, com posição calculada a partir do gatilho, em vez de
   * `position: absolute` dentro do próprio container. Necessário para gatilhos que moram numa
   * lista com scroll (ex.: histórico de chats) — sem isso, um `overflow-y-auto` ancestral corta
   * o painel (ou ele fica escondido atrás do rodapé fixo abaixo da lista). `panelClassName` deve
   * vir SEM classes de posicionamento (absolute/right-0/top-9/...) quando isto está ligado —
   * a posição é toda via inline style.
   */
  portal?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  function setOpen(value: boolean) {
    setUncontrolledOpen(value);
    onOpenChange?.(value);
  }

  useEffect(() => {
    if (!open || !portal || !rootRef.current) return;
    // Abre pra baixo por padrão; se não sobrar espaço visível abaixo (gatilho perto do fim da
    // lista/tela), abre pra cima — sem isso o painel simplesmente sumia atrás do rodapé fixo.
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const right = window.innerWidth - rect.right;
    setPosition(spaceBelow < 200 && rect.top > 200 ? { bottom: window.innerHeight - rect.top + 4, right } : { top: rect.bottom + 4, right });
  }, [open, portal]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Reposicionar sob scroll é mais complexidade do que vale aqui (painéis pequenos, de vida
    // curta) — fechar junto com o scroll da lista evita o painel "descolar" do gatilho.
    const onScroll = () => setOpen(false);
    if (portal) window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      if (portal) window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, portal]);

  const panel = (
    <div
      ref={panelRef}
      role="menu"
      onClick={() => setOpen(false)}
      style={portal && position ? { position: "fixed", top: position.top, bottom: position.bottom, right: position.right } : undefined}
      className={cn("animate-fade-in", portal && "z-50", panelClassName)}
    >
      {children}
    </div>
  );

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
      {open && (portal ? position && typeof document !== "undefined" && createPortal(panel, document.body) : panel)}
    </div>
  );
}
