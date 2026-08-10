import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { AppNavMobile } from "@/components/app-nav-mobile";
import { LogoutButton } from "@/components/logout-button";
import { NavDropdown } from "@/components/nav-dropdown";
import { buttonVariants } from "@/components/ui/button";
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
      { href: "/materiais", label: "Materiais", icon: "ti-book-2", description: "Materiais de estudo da IA" },
      { href: "/tutorial", label: "Tutorial", icon: "ti-help-circle", description: "Como usar cada parte da plataforma" }
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
  userName,
  isAdmin = false,
  hasActiveSubscription = false,
  logoUrl = "/brand/logo.png",
  appName = "Gerador de Questões",
  streak,
  streakActiveToday = false
}: {
  userName: string;
  isAdmin?: boolean;
  /** false = trial/sem assinatura paga — mostra o CTA de upgrade no drawer mobile. */
  hasActiveSubscription?: boolean;
  logoUrl?: string;
  appName?: string;
  /** Dias seguidos de estudo. undefined esconde o badge. */
  streak?: number;
  streakActiveToday?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/92 shadow-sm backdrop-blur">
      <AppNavMobile userName={userName} isAdmin={isAdmin} showUpgrade={!hasActiveSubscription} />

      <div className="relative hidden w-full items-center justify-between gap-3 px-4 py-3 md:flex md:px-6">
        <Link className="flex items-center" href="/desempenho">
          <AppLogo
            lightSrc={logoUrl}
            darkSrc="/brand/logo-white.png"
            alt={appName}
            className="h-9 w-auto max-w-[190px] object-contain md:h-12 md:max-w-[270px]"
          />
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
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
