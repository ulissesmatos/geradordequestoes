import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const query = (filters.q ?? "").trim();
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } }
        ]
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.user.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Usuários" description={`${total} usuários · página ${page} de ${totalPages}`} />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por nome ou e-mail..." className="max-w-sm" />
        <SubmitButton variant="outline">Buscar</SubmitButton>
      </form>

      <Card>
        <CardContent className="divide-y divide-[var(--border)] p-0">
          {users.map((user) => {
            const subscription = user.subscriptions[0];
            return (
              <Link
                key={user.id}
                href={`/admin/usuarios/${user.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-subtle)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-sm text-[var(--muted-foreground)]">{user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {user.isBlocked && <StatusBadge tone="danger">Bloqueado</StatusBadge>}
                  {user.role === "ADMIN" && <StatusBadge tone="info">Admin</StatusBadge>}
                  {subscription ? (
                    <StatusBadge tone={statusTone(subscription.status)}>{subscription.plan.name}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Sem plano</StatusBadge>
                  )}
                  <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
                </div>
              </Link>
            );
          })}
          {users.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">Nenhum usuário encontrado.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <a
          aria-disabled={page <= 1}
          href={`/admin/usuarios?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page - 1) }).toString()}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Anterior
        </a>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/usuarios?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page + 1) }).toString()}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Próxima
        </a>
      </div>
    </div>
  );
}
