"use client";

import Link from "next/link";
import { Flame, Menu, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mini-header mobile compartilhado — mesmo em toda página: hambúrguer à esquerda (abre o
 * MobileNavDrawer), título no centro. À direita, a sequência de dias fica sempre visível (é o
 * gatilho de hábito — escondida numa aba ela não incentiva ninguém a voltar todo dia); o atalho
 * "Novo chat" só aparece dentro do próprio /ai, onde faz sentido. Sempre escondido em md: — quem
 * usa decide o que mostrar ao lado no desktop.
 */
export function MobileTopBar({
  title,
  onOpenMenu,
  streak,
  streakActiveToday = false,
  showNewChatButton = false
}: {
  title: React.ReactNode;
  onOpenMenu: () => void;
  streak?: number;
  streakActiveToday?: boolean;
  showNewChatButton?: boolean;
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
      {showNewChatButton && (
        <Link
          href="/ai?new=1"
          aria-label="Novo chat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
