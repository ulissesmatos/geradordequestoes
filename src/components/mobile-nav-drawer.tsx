"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
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

export type NavDestination = { href: string; label: string; icon: typeof Sparkles; secondary?: boolean };

/**
 * Os mesmos 7 destinos que o AppNav já expõe no desktop — reaproveitados aqui pro drawer mobile
 * e por AppNav pra derivar o título do MobileTopBar a partir da rota (ver mobile-top-bar.tsx).
 * `secondary` replica o mesmo corte que o AppNav desktop já fazia com os dropdowns "Estudar"/"Meu
 * conteúdo": Painel e Chat IA são os únicos itens de topo mesmo lá; o resto entra atrás de "Mais"
 * aqui no mobile — menos coisa fixa disputando espaço com o histórico de conversas.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  { href: "/desempenho", label: "Painel", icon: LayoutDashboard },
  { href: "/ai", label: "Chat IA", icon: Sparkles },
  { href: "/questoes", label: "Questões", icon: ListChecks, secondary: true },
  { href: "/revisao", label: "Revisão", icon: CalendarClock, secondary: true },
  { href: "/simulados", label: "Simulados", icon: Timer, secondary: true },
  { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen, secondary: true },
  { href: "/materiais", label: "Materiais", icon: BookOpen, secondary: true }
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

function NavLink({ item, active, onClick }: { item: NavDestination; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold",
        active ? "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]" : "text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

/**
 * Drawer mobile único (estilo ChatGPT), compartilhado entre AppNav (todas as páginas) e
 * AiChatDashboard (chat, que passa o histórico de conversas em `middleSlot`). Navegação e
 * histórico dividem a MESMA área de rolagem (rolam juntos, como no ChatGPT) — só o cabeçalho e o
 * rodapé de conta ficam fixos. Itens secundários ficam atrás de "Mais", pra não brigar por
 * espaço com o histórico quando o chat está aberto.
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
  /** Conteúdo específico da página, na mesma área de rolagem da navegação — ex.: histórico de
   *  conversas no chat. Omitido nas demais páginas (não busca sessões em toda navegação). */
  middleSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const primaryItems = NAV_DESTINATIONS.filter((item) => !item.secondary);
  const secondaryItems = NAV_DESTINATIONS.filter((item) => item.secondary);
  const secondaryHasActive = secondaryItems.some((item) => isRouteActive(pathname, item.href));

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

        {/* Uma ÚNICA área de rolagem pra navegação + conteúdo da página (ex. histórico de chat) —
            rolam juntos, a navegação some pra cima ao rolar pra baixo, igual ao ChatGPT. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="border-b border-[var(--border)] p-2">
            {primaryItems.map((item) => (
              <NavLink key={item.href} item={item} active={isRouteActive(pathname, item.href)} onClick={onClose} />
            ))}
            <details className="group" open={secondaryHasActive}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3">
                  <MoreHorizontal className="h-4 w-4 shrink-0" />
                  Mais
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-0.5">
                {secondaryItems.map((item) => (
                  <NavLink key={item.href} item={item} active={isRouteActive(pathname, item.href)} onClick={onClose} />
                ))}
              </div>
            </details>
          </nav>

          {middleSlot}
        </div>

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
