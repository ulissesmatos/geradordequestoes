"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, BookOpen, CreditCard, FileQuestion, FolderCog, ListChecks, Mail, ScrollText, Settings, Users } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Operação",
    links: [
      { href: "/admin", label: "Dashboard", icon: BarChart3 },
      { href: "/admin/usuarios", label: "Usuários", icon: Users }
    ]
  },
  {
    label: "Receita",
    links: [
      { href: "/admin/planos", label: "Planos & Pricing", icon: CreditCard },
      { href: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard }
    ]
  },
  {
    label: "IA",
    links: [
      { href: "/admin/ia", label: "Provedores e limites", icon: Settings },
      { href: "/admin/logs-ia", label: "Logs IA", icon: Bot },
      { href: "/admin/questoes/gerar", label: "Gerar questões", icon: Bot }
    ]
  },
  {
    label: "Conteúdo",
    links: [
      { href: "/admin/questoes", label: "Questões", icon: FileQuestion },
      { href: "/admin/questoes/revisar", label: "Revisar questões", icon: ListChecks },
      { href: "/admin/materiais-ia", label: "Materiais IA", icon: FolderCog },
      { href: "/admin/materias", label: "Matérias", icon: BookOpen },
      { href: "/admin/assuntos", label: "Assuntos", icon: ListChecks }
    ]
  },
  {
    label: "Plataforma",
    links: [
      { href: "/admin/email", label: "E-mail", icon: Mail },
      { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
      { href: "/admin/branding", label: "Branding", icon: Settings }
    ]
  }
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-[#21484a] bg-[var(--surface-strong)] text-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="p-4">
        <Link className="text-lg font-bold" href="/admin">
          Administração
        </Link>
      </div>
      <nav className="flex gap-3 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
        {groups.map((group) => (
          <div key={group.label} className="min-w-max space-y-1 md:min-w-0">
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-white/45">{group.label}</p>
            {group.links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    active ? "bg-white/15 font-semibold text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                  )}
                  href={link.href}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <Link href="/ai">Área do aluno</Link>
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
