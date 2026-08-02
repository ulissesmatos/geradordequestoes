import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { LogoutButton } from "@/components/logout-button";
import { NavDropdown } from "@/components/nav-dropdown";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Navegação do aluno, dirigida por UMA configuração: itens simples viram link,
 * itens com `children` viram dropdown (hover no desktop, seção no mobile).
 * Todos os gatilhos/links usam as MESMAS classes (buttonVariants ghost/sm),
 * então tipografia e altura são idênticas por construção.
 *
 * Ícones via classe Tabler (`ti ti-*`, carregada por SaasableAssets) em vez de
 * componente lucide-react — mesmo conjunto de ícones da landing page/páginas
 * públicas, só a cor/tipografia acompanha; layout e densidade ficam como estão.
 */

type NavLeaf = { href: string; label: string; icon: string; description: string };
type NavItem =
  | { label: string; icon: string; href: string; children?: never }
  | { label: string; icon: string; href?: never; children: NavLeaf[] };

const navItems: NavItem[] = [
  // Painel primeiro: é a tela inicial pós-login e o ponto de partida do dia.
  { label: "Painel", icon: "ti-layout-dashboard", href: "/desempenho" },
  { label: "Chat IA", icon: "ti-sparkles", href: "/ai" },
  {
    label: "Estudar",
    icon: "ti-school",
    children: [
      { href: "/questoes", label: "Questões", icon: "ti-list-check", description: "Banco de questões da plataforma" },
      { href: "/revisao", label: "Revisão", icon: "ti-calendar-time", description: "Sua agenda de revisão espaçada" },
      { href: "/simulados", label: "Simulados", icon: "ti-clock-play", description: "Provas cronometradas estilo Cebraspe" }
    ]
  },
  {
    label: "Meu conteúdo",
    icon: "ti-folder",
    children: [
      { href: "/biblioteca", label: "Biblioteca", icon: "ti-folder", description: "Blocos gerados e favoritos" },
      { href: "/materiais", label: "Materiais", icon: "ti-book-2", description: "Materiais de estudo da IA" }
    ]
  }
];

// Uma única fonte de estilo para TODOS os itens do nível superior.
const topItemClass = cn(buttonVariants({ variant: "ghost", size: "sm" }));
const accountTriggerClass = cn(buttonVariants({ variant: "outline", size: "sm" }));

const panelClass =
  "absolute left-0 top-[calc(100%+6px)] z-40 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg";
const accountPanelClass =
  "absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg";

const panelItemClass = "flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-[var(--surface-subtle)]";
const mobileItemClass =
  "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]";
const mobileSectionClass = "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

function PanelLink({ href, label, description, icon }: NavLeaf) {
  return (
    <Link href={href} className={panelItemClass}>
      <i className={cn("ti mt-0.5 shrink-0 text-base leading-none text-[var(--primary)]", icon)} />
      <span>
        <span className="block text-sm font-semibold text-[var(--foreground)]">{label}</span>
        <span className="block text-xs text-[var(--muted-foreground)]">{description}</span>
      </span>
    </Link>
  );
}

export function AppNav({
  isAdmin = false,
  logoUrl = "/brand/logo.png",
  appName = "Gerador de Questões",
  streak,
  streakActiveToday = false
}: {
  isAdmin?: boolean;
  logoUrl?: string;
  appName?: string;
  /** Dias seguidos de estudo. undefined esconde o badge. */
  streak?: number;
  streakActiveToday?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/92 shadow-sm backdrop-blur">
      <div className="relative flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link className="flex items-center" href="/desempenho">
          <AppLogo
            lightSrc={logoUrl}
            darkSrc="/brand/logo-white.png"
            alt={appName}
            className="h-9 w-auto max-w-[190px] object-contain md:h-12 md:max-w-[270px]"
          />
        </Link>

        {/* ── Mobile: hambúrguer com a lista completa ── */}
        <div className="md:hidden">
          <DropdownMenu
            ariaLabel="Abrir menu"
            triggerClassName="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
            trigger={<i className="ti ti-menu-2 text-xl leading-none" />}
            panelClassName="absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          >
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label}>
                  <p className={mobileSectionClass}>{item.label}</p>
                  {item.children.map((child) => (
                    <Link key={child.href} href={child.href} className={mobileItemClass}>
                      <i className={cn("ti text-base leading-none", child.icon)} />
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={mobileItemClass}>
                  <i className={cn("ti text-base leading-none", item.icon)} />
                  {item.label}
                </Link>
              )
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <Link href="/perfil" className={mobileItemClass}>
              <i className="ti ti-user text-base leading-none" />
              Perfil e assinatura
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="mt-1 flex items-center gap-3 rounded-md bg-[var(--accent-soft)] px-3 py-3 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-soft-hover)]"
              >
                <i className="ti ti-settings text-base leading-none" />
                Admin
              </Link>
            )}
            <LogoutButton className="mt-1 flex w-full items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]" />
          </DropdownMenu>
        </div>

        {/* ── Desktop: itens simples e dropdowns com estilo único ── */}
        <nav className="hidden flex-wrap items-center gap-1 md:flex">
          {/* Sequência sempre à vista: escondida numa aba, ela não sustenta hábito nenhum. */}
          {streak !== undefined && streak > 0 && (
            <Link
              href="/desempenho"
              title={
                streakActiveToday
                  ? `${streak} dias seguidos de estudo`
                  : `${streak} dias seguidos — responda hoje para não perder`
              }
              className={cn(
                "mr-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums transition",
                streakActiveToday
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              <i className="ti ti-flame text-base leading-none" />
              {streak}
            </Link>
          )}
          {navItems.map((item) =>
            item.children ? (
              <NavDropdown
                key={item.label}
                ariaLabel={item.label}
                triggerClassName={topItemClass}
                panelClassName={panelClass}
                trigger={
                  <>
                    <i className={cn("ti text-base leading-none", item.icon)} />
                    {item.label}
                  </>
                }
              >
                {item.children.map((child) => (
                  <PanelLink key={child.href} {...child} />
                ))}
              </NavDropdown>
            ) : (
              <Link key={item.href} href={item.href} className={topItemClass}>
                <i className={cn("ti text-base leading-none", item.icon)} />
                {item.label}
              </Link>
            )
          )}

          <NavDropdown
            ariaLabel="Conta"
            triggerClassName={accountTriggerClass}
            panelClassName={accountPanelClass}
            trigger={
              <>
                <i className="ti ti-user text-base leading-none" />
                Conta
              </>
            }
          >
            <Link href="/perfil" className="block rounded-md px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-subtle)]">
              Perfil e assinatura
            </Link>
            {isAdmin && (
              <Link href="/admin" className="block rounded-md px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-subtle)]">
                Admin
              </Link>
            )}
            <LogoutButton className="mt-1 flex w-full rounded-md border border-[var(--border)] px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--surface-subtle)]" />
          </NavDropdown>
        </nav>
      </div>
    </header>
  );
}
