"use client";

import Link from "next/link";
import { Flame, Menu, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mini-header mobile compartilhado — mesmo em toda página, inclusive fora do chat: hambúrguer à
 * esquerda (abre o MobileNavDrawer), título no centro. À direita, sequência de dias + atalho
 * "Novo chat" ficam sempre visíveis, independente da página (por pedido explícito) — a
 * sequência como lembrete diário de estudo, o atalho pra começar uma conversa de qualquer lugar
 * do app. Sempre escondido em md: — quem usa decide o que mostrar ao lado no desktop.
 */
export function MobileTopBar({
  title,
  onOpenMenu,
  streak,
  streakActiveToday = false
}: {
  title: React.ReactNode;
  onOpenMenu: () => void;
  streak?: number;
  streakActiveToday?: boolean;
}) {
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
      {streak !== undefined && streak > 0 && (
        <Link
          href="/desempenho"
          aria-label={streakActiveToday ? `${streak} dias seguidos de estudo` : `${streak} dias seguidos — responda hoje para não perder`}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-bold tabular-nums transition",
            streakActiveToday
              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          )}
        >
          <Flame className="h-4 w-4" />
          {streak}
        </Link>
      )}
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
