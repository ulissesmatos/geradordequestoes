import Link from "next/link";
import { BarChart3, Bot, BookOpen, CreditCard, FileQuestion, ListChecks, Settings, Users } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/admin", label: "Painel", icon: BarChart3 },
  { href: "/admin/materias", label: "Matérias", icon: BookOpen },
  { href: "/admin/assuntos", label: "Assuntos", icon: ListChecks },
  { href: "/admin/questoes", label: "Questões", icon: FileQuestion },
  { href: "/admin/questoes/gerar", label: "Gerar IA", icon: Bot },
  { href: "/admin/ia", label: "Config IA", icon: Settings },
  { href: "/admin/questoes/revisar", label: "Revisar", icon: ListChecks },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/planos", label: "Planos", icon: CreditCard },
  { href: "/admin/logs-ia", label: "Logs IA", icon: Bot }
];

export function AdminSidebar() {
  return (
    <aside className="border-b border-[#21484a] bg-[var(--surface-strong)] text-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="p-4">
        <Link className="text-lg font-bold" href="/admin">
          Administração
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
        {links.map((link) => (
          <Link
            key={link.href}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white"
            href={link.href}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        ))}
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <Link href="/dashboard">Área do aluno</Link>
        </Button>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" className="mt-2 !text-white hover:bg-white/10" type="submit">
            Sair
          </Button>
        </form>
      </nav>
    </aside>
  );
}
