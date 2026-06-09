import Image from "next/image";
import Link from "next/link";
import { BookOpen, ClipboardList, Home, Menu, RotateCcw, User } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Chat IA", icon: Home },
  { href: "/materias", label: "Matérias", icon: BookOpen },
  { href: "/questoes/estudar", label: "Estudar", icon: ClipboardList },
  { href: "/questoes/simulado", label: "Simulado", icon: ClipboardList },
  { href: "/revisao", label: "Revisão", icon: RotateCcw },
  { href: "/perfil", label: "Perfil", icon: User }
];

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/92 shadow-sm backdrop-blur">
      <div className="relative flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link className="flex items-center" href="/dashboard">
          <Image src="/brand/logo.png" alt="Gerador de Questões" width={744} height={179} className="h-9 w-auto max-w-[190px] object-contain md:h-12 md:max-w-[270px]" />
        </Link>
        <details className="group md:hidden">
          <summary className="flex h-10 w-10 list-none items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm marker:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menu</span>
          </summary>
          <nav className="absolute left-3 right-3 top-[calc(100%+8px)] z-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]">
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin" className="mt-1 flex items-center gap-3 rounded-md bg-[var(--accent-soft)] px-3 py-3 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-soft-hover)]">
                Admin
              </Link>
            )}
            <form action={logoutAction} className="mt-1">
              <button type="submit" className="flex w-full items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]">
                Sair
              </button>
            </form>
          </nav>
        </details>
        <nav className="hidden flex-wrap items-center gap-1 md:flex">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link href={link.href}>
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            </Button>
          ))}
          {isAdmin && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          )}
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">
              Sair
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
