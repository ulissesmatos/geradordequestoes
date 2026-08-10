import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { getUsersUsageTotals } from "@/lib/usage/report";

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
        // Mesmo recorte de getActiveSubscription (status + vigência). Sem o filtro, a lista
        // pegava a assinatura mais recente FOSSE QUAL FOSSE o status e estampava o nome do
        // plano: cancelar alguém no painel deixava a badge "Premium" no ar, contradizendo o
        // acesso que a pessoa realmente tinha.
        subscriptions: {
          where: {
            status: SubscriptionStatus.ACTIVE,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
          },
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
  // Consumo da página inteira em duas consultas — uma por usuário seriam 25 idas ao banco só
  // para preencher uma coluna. Vale mesmo com o medidor em modo sombra: as linhas do
  // livro-caixa são gravadas de qualquer jeito, então o número já é real.
  const usage = await getUsersUsageTotals(users.map((user) => user.id));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Usuários"
        description={`${total} usuários · página ${page} de ${totalPages} · "questões" = geradas no ciclo do mês calendário`}
      />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por nome ou e-mail..." className="max-w-sm" />
        <SubmitButton variant="outline">Buscar</SubmitButton>
      </form>

      <Card>
        <CardContent className="divide-y divide-[var(--border)] p-0">
          {users.map((user) => {
            // Só sobra assinatura vigente aqui — a badge fala do acesso de hoje, não do histórico.
            const activeSubscription = user.subscriptions[0];
            const consumo = usage.get(user.id);
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
                  <div className="hidden text-right text-xs leading-tight text-[var(--muted-foreground)] sm:block">
                    <p className="tabular-nums">
                      <strong className="text-[var(--foreground)]">{(consumo?.questionsMonth ?? 0).toLocaleString("pt-BR")}</strong>{" "}
                      questões no mês
                    </p>
                    <p className="tabular-nums">
                      {(consumo?.questionsTotal ?? 0).toLocaleString("pt-BR")} no total ·{" "}
                      {(consumo?.chatMonth ?? 0).toLocaleString("pt-BR")} ações
                    </p>
                  </div>
                  {user.isBlocked && <StatusBadge tone="danger">Bloqueado</StatusBadge>}
                  {user.role === "ADMIN" && <StatusBadge tone="info">Admin</StatusBadge>}
                  {activeSubscription ? (
                    <StatusBadge tone="success">{activeSubscription.plan.name}</StatusBadge>
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

      <AdminPagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/usuarios?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) }).toString()}`}
      />
    </div>
  );
}
