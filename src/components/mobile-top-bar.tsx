"use client";

import Link from "next/link";
import { Menu, MessageSquarePlus } from "lucide-react";

/**
 * Mini-header mobile compartilhado — mesmo em toda página, inclusive fora do chat: hambúrguer à
 * esquerda (abre o MobileNavDrawer), título no centro, atalho "Novo chat" sempre à direita
 * (mesmo fora do /ai, por pedido explícito). Sempre escondido em md: — quem usa decide o que
 * mostrar ao lado no desktop.
 */
export function MobileTopBar({ title, onOpenMenu }: { title: React.ReactNode; onOpenMenu: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 md:hidden">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={onOpenMenu}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--foreground)]">{title}</span>
      <Link
        href="/ai?new=1"
        aria-label="Novo chat"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </Link>
    </div>
  );
}
