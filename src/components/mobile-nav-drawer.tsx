"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  ChevronUp,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Settings,
  Sparkles,
  Timer,
  User,
  X
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type NavDestination = { href: string; label: string; icon: typeof Sparkles };

/**
 * Os mesmos 7 destinos que o AppNav já expõe no desktop — reaproveitados aqui pro drawer mobile
 * e por AppNav pra derivar o título do MobileTopBar a partir da rota (ver mobile-top-bar.tsx).
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  { href: "/desempenho", label: "Painel", icon: LayoutDashboard },
  { href: "/ai", label: "Chat IA", icon: Sparkles },
  { href: "/questoes", label: "Questões", icon: ListChecks },
  { href: "/revisao", label: "Revisão", icon: CalendarClock },
  { href: "/simulados", label: "Simulados", icon: Timer },
  { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen },
  { href: "/materiais", label: "Materiais", icon: BookOpen }
];

function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Drawer mobile único (estilo ChatGPT), compartilhado entre AppNav (todas as páginas) e
 * AiChatDashboard (chat, que passa o histórico de conversas em `middleSlot`). Navegação fixa em
 * cima, conta/config/sair num menu que abre a partir da linha de conta no rodapé — não fica tudo
 * empilhado solto, que era o problema original.
 */
export function MobileNavDrawer({
  open,
  onClose,
  userName,
  isAdmin,
  showUpgrade,
  middleSlot
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  isAdmin: boolean;
  /** true = sem assinatura paga ativa (trial/grátis) — mostra o CTA de upgrade. */
  showUpgrade: boolean;
  /** Conteúdo específico da página, entre a navegação fixa e o rodapé de conta — ex.: histórico
   *  de conversas no chat. Omitido nas demais páginas (não busca sessões em toda navegação). */
  middleSlot?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    // md:hidden é redundante na maioria dos casos (nada abre o drawer fora do mobile), mas
    // garante que ele não fique visível se a janela for redimensionada pra desktop com o
    // drawer aberto (ex.: virar o celular, ou dev tools saindo do modo responsivo).
    <div className="md:hidden">
      <Sheet open={open} onClose={onClose} side="left" className="flex w-80 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
          <span className="text-sm font-semibold">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="border-b border-[var(--border)] p-2">
          {NAV_DESTINATIONS.map((item) => {
            const active = isRouteActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold",
                  active
                    ? "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {middleSlot && <div className="min-h-0 flex-1 overflow-y-auto">{middleSlot}</div>}
        {!middleSlot && <div className="flex-1" />}

        {/* Rodapé fixo: conta (abre menu PRA CIMA) + upgrade ao lado — estilo ChatGPT, em vez de
            Perfil/Admin/Sair empilhados soltos no meio da navegação. */}
        <div className="flex items-center gap-2 border-t border-[var(--border)] p-2">
          <DropdownMenu
            ariaLabel="Conta"
            triggerClassName="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-subtle)]"
            panelClassName="absolute left-0 bottom-[calc(100%+8px)] z-40 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
            trigger={
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-soft-foreground)]">
                  {initials(userName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{userName}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">{showUpgrade ? "Plano gratuito" : "Assinatura ativa"}</span>
                </span>
                <ChevronUp className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              </>
            }
          >
            <Link
              href="/perfil"
              onClick={onClose}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
            >
              <User className="h-4 w-4" />
              Perfil e assinatura
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={onClose}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
              >
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <LogoutButton className="flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]" />
          </DropdownMenu>
          {showUpgrade && (
            <Link
              href="/pricing"
              onClick={onClose}
              className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-[var(--primary-foreground)] hover:opacity-90"
            >
              Fazer upgrade
            </Link>
          )}
        </div>
      </Sheet>
    </div>
  );
}
