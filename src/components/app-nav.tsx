import Link from "next/link";
import { BookOpen, ClipboardList, Home, RotateCcw, User } from "lucide-react";
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
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link className="text-lg font-extrabold tracking-tight text-[var(--primary)]" href="/dashboard">
          Questões C/E
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
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
