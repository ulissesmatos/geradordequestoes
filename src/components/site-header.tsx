import Image from "next/image";
import Link from "next/link";
import { Menu, User } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";

type Props = {
  logoUrl: string;
  appName: string;
  /** Quando false, oculta o link "Planos" (ex.: na própria página de planos). */
  showPlans?: boolean;
  /** Não fixa o header no topo (a landing usa sticky; páginas internas não precisam). */
  sticky?: boolean;
};

const navLinks = (showPlans: boolean) => [
  ...(showPlans ? [{ href: "/pricing", label: "Planos" }] : []),
  { href: "/contato", label: "Contato" }
];

/** Header público reutilizável (landing, pricing, contato). Esconde Entrar/Criar conta
 *  quando já há sessão — nesse caso mostra um atalho direto para a plataforma. */
export async function SiteHeader({ logoUrl, appName, showPlans = true, sticky = true }: Props) {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.id);
  const links = navLinks(showPlans);
  return (
    <header
      className={`${sticky ? "sticky top-0 z-30 " : ""}border-b border-[var(--border)] bg-[var(--background)]/88 backdrop-blur`}
    >
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logoUrl}
            alt={appName}
            width={744}
            height={179}
            className="h-11 w-auto max-w-[210px] object-contain md:h-14 md:max-w-[290px]"
            priority
          />
        </Link>

        {/* Mobile */}
        <details className="group md:hidden">
          <summary className="flex h-10 w-10 list-none items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm marker:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menu</span>
          </summary>
          <nav className="absolute left-3 right-3 top-[calc(100%+8px)] z-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]">
                {l.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <Link href="/ai" className="mt-1 flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-3 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]">
                <User className="h-4 w-4" />
                Acessar minha conta
              </Link>
            ) : (
              <>
                <Link href="/login" className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]">
                  Entrar
                </Link>
                <Link href="/register" className="mt-1 block rounded-md bg-[var(--primary)] px-3 py-3 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]">
                  Criar conta
                </Link>
              </>
            )}
          </nav>
        </details>

        {/* Desktop */}
        <nav className="hidden items-center gap-2 md:flex">
          {links.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
          {isLoggedIn ? (
            <Button asChild size="sm">
              <Link href="/ai">
                <User className="h-4 w-4" />
                Acessar minha conta
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Criar conta</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
