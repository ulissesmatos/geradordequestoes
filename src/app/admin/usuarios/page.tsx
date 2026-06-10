import { activateUserSubscriptionAction, cancelUserSubscriptionAction, updateUserAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

  const [users, total, plans, coupons] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        subscriptions: {
          include: { plan: true, coupon: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.user.count({ where }),
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
    prisma.coupon.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Usuários</h1>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por nome ou e-mail..." className="max-w-sm" />
        <SubmitButton variant="outline">Buscar</SubmitButton>
        <span className="text-sm text-[var(--muted-foreground)]">{total} usuários · página {page} de {totalPages}</span>
      </form>
      {users.map((user) => {
        const subscription = user.subscriptions[0];
        return (
          <Card key={user.id}>
            <CardContent className="space-y-4 pt-5">
              <form action={updateUserAction} className="grid gap-3 md:grid-cols-[1fr_160px_140px_auto] md:items-center">
                <input type="hidden" name="userId" value={user.id} />
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Assinatura: {subscription ? `${subscription.plan.name} / ${subscription.status}` : "sem plano"}
                  </p>
                </div>
                <Select name="role" defaultValue={user.role}><option value="USER">USER</option><option value="ADMIN">ADMIN</option></Select>
                <label className="flex items-center gap-2 text-sm"><input name="isBlocked" type="checkbox" defaultChecked={user.isBlocked} /> Bloqueado</label>
                <SubmitButton>Salvar usuário</SubmitButton>
              </form>

              <div className="grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-[1fr_auto]">
                <form action={activateUserSubscriptionAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="userId" value={user.id} />
                  <Select name="planId" required>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </Select>
                  <Select name="couponId" defaultValue="">
                    <option value="">Sem cupom</option>
                    {coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.code}</option>)}
                  </Select>
                  <SubmitButton>Ativar assinatura</SubmitButton>
                </form>
                <form action={cancelUserSubscriptionAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <SubmitButton variant="outline">Cancelar assinatura</SubmitButton>
                </form>
              </div>
            </CardContent>
          </Card>
        );
      })}

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
