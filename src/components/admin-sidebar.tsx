"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BookOpen,
  Bug,
  Building2,
  CreditCard,
  FileQuestion,
  Flag,
  FolderCog,
  Handshake,
  Inbox,
  ListChecks,
  Mail,
  Menu,
  ScrollText,
  Settings,
  Timer,
  Users,
  X
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Operação",
    links: [
      { href: "/admin", label: "Dashboard", icon: BarChart3 },
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin/contato", label: "Contato", icon: Inbox }
    ]
  },
  {
    label: "Receita",
    links: [
      { href: "/admin/planos", label: "Planos & Pricing", icon: CreditCard },
      { href: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
      { href: "/admin/afiliados", label: "Afiliados", icon: Handshake },
      { href: "/admin/teams", label: "Teams / Empresas", icon: Building2 }
    ]
  },
  {
    label: "Questões & Simulados",
    links: [
      { href: "/admin/questoes", label: "Questões", icon: FileQuestion },
      { href: "/admin/questoes/gerar", label: "Gerar questões", icon: Bot },
      { href: "/admin/questoes/revisar", label: "Revisar questões", icon: ListChecks },
      { href: "/admin/feedbacks", label: "Feedback de questões", icon: Flag },
      { href: "/admin/simulados", label: "Simulados", icon: Timer }
    ]
  },
  {
    label: "Conteúdo & Matérias",
    links: [
      { href: "/admin/referencias", label: "Materiais de referência", icon: BookOpen },
      { href: "/admin/materiais-ia", label: "Materiais IA", icon: FolderCog },
      { href: "/admin/materias", label: "Matérias e assuntos", icon: BookOpen }
    ]
  },
  {
    label: "IA",
    links: [
      { href: "/admin/ia", label: "Provedores e limites", icon: Settings },
      { href: "/admin/logs-ia", label: "Logs IA", icon: Bot }
    ]
  },
  {
    label: "Plataforma",
    links: [
      { href: "/admin/email", label: "E-mail", icon: Mail },
      { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
      { href: "/admin/erros-cliente", label: "Erros do navegador", icon: Bug },
      { href: "/admin/branding", label: "Branding", icon: Settings }
    ]
  }
];

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="space-y-0.5">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase leading-4 tracking-wide text-white/45">
            {group.label}
          </p>
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
      <Button asChild variant="secondary" size="sm" className="mt-3">
        <Link href="/ai">Área do aluno</Link>
      </Button>
      <form action={logoutAction}>
        <Button variant="ghost" size="sm" className="mt-2 w-full !text-white hover:bg-white/10" type="submit">
          Sair
        </Button>
      </form>
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o drawer ao navegar.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* ── Top bar mobile ── */}
      <div className="flex items-center justify-between border-b border-[#21484a] bg-[var(--surface-strong)] px-4 py-3 text-white md:hidden">
        <Link className="text-base font-bold" href="/admin">
          Administração
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-md p-1.5 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* ── Drawer mobile (o Sheet já rola quando o conteúdo passa da altura) ── */}
      <Sheet open={open} onClose={() => setOpen(false)} side="left" className="bg-[var(--surface-strong)] text-white">
        <div className="flex items-center justify-between px-4 py-4">
          <Link className="text-lg font-bold" href="/admin" onClick={() => setOpen(false)}>
            Administração
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="rounded-md p-1.5 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-6">
          <NavLinks pathname={pathname} />
        </nav>
      </Sheet>

      {/* ── Sidebar desktop: fixa na tela, com scroll próprio quando necessário ── */}
      <aside className="hidden border-r border-[#21484a] bg-[var(--surface-strong)] text-white md:sticky md:top-0 md:block md:h-screen md:w-64 md:overflow-y-auto">
        <div className="p-4">
          <Link className="text-lg font-bold" href="/admin">
            Administração
          </Link>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-6">
          <NavLinks pathname={pathname} />
        </nav>
      </aside>
    </>
  );
}
