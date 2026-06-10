import Image from "next/image";
import Link from "next/link";
import { BookOpen, FolderOpen, Menu, Settings, Sparkles, User } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

const links = [
  { href: "/ai", label: "Chat IA", icon: Sparkles },
  { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen },
  { href: "/materiais", label: "Materiais", icon: BookOpen }
];

export function AppNav({
  isAdmin = false,
  logoUrl = "/brand/logo.png",
  appName = "Gerador de Questões"
}: {
  isAdmin?: boolean;
  logoUrl?: string;
  appName?: string;
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/92 shadow-sm backdrop-blur">
      <div className="relative flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link className="flex items-center" href="/ai">
          <Image src={logoUrl} alt={appName} width={744} height={179} className="h-9 w-auto max-w-[190px] object-contain md:h-12 md:max-w-[270px]" />
        </Link>

        {/* Mobile: menu hambúrguer */}
        <div className="md:hidden">
          <DropdownMenu
            ariaLabel="Abrir menu"
            triggerClassName="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
            trigger={<Menu className="h-5 w-5" />}
            panelClassName="absolute right-0 top-[calc(100%+8px)] z-40 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          >
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]">
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-[var(--border)]" />
            <Link href="/perfil" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]">
              <User className="h-4 w-4" />
              Perfil e assinatura
            </Link>
            {isAdmin && (
              <Link href="/admin" className="mt-1 flex items-center gap-3 rounded-md bg-[var(--accent-soft)] px-3 py-3 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-soft-hover)]">
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            )}
            <form action={logoutAction} className="mt-1">
              <button type="submit" className="flex w-full items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]">
                Sair
              </button>
            </form>
          </DropdownMenu>
        </div>

        {/* Desktop: navegação + menu de conta */}
        <nav className="hidden flex-wrap items-center gap-1 md:flex">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link href={link.href}>
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            </Button>
          ))}
          <DropdownMenu
            ariaLabel="Conta"
            triggerClassName="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]"
            trigger={<><User className="h-4 w-4" />Conta</>}
            panelClassName="absolute right-0 top-11 z-40 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          >
            <Link href="/perfil" className="block rounded-md px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Perfil e assinatura</Link>
            {isAdmin && <Link href="/admin" className="block rounded-md px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Admin</Link>}
            <form action={logoutAction}>
              <button type="submit" className="mt-1 block w-full rounded-md border border-[var(--border)] px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--surface-subtle)]">
                Sair
              </button>
            </form>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
