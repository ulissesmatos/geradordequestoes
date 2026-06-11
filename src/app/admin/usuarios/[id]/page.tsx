import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { activateUserSubscriptionAction, cancelUserSubscriptionAction, updateUserAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { getAiUsageStatus } from "@/lib/subscriptions";
import { formatCpf, formatPhone } from "@/lib/validation/cpf";

function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDay(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, plans, coupons] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: { include: { plan: true, coupon: true }, orderBy: { createdAt: "desc" } },
        paymentTransactions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 10 },
        checkoutSessions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 10 }
      }
    }),
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
    prisma.coupon.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })
  ]);

  if (!user) notFound();

  const teamSeat = await prisma.teamSeat.findFirst({
    where: { userId: user.id, status: "CLAIMED" },
    include: { teamAccount: { select: { id: true, name: true } } }
  });
  const usage = await getAiUsageStatus({ id: user.id, role: user.role });
  const activeSub = user.subscriptions.find(
    (s) => s.status === "ACTIVE" && (!s.endsAt || s.endsAt > new Date())
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/usuarios" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para usuários
      </Link>

      <AdminPageHeader
        title={user.name}
        description={user.email}
        actions={
          <div className="flex gap-2">
            {user.isBlocked && <StatusBadge tone="danger">Bloqueado</StatusBadge>}
            {user.role === "ADMIN" && <StatusBadge tone="info">Admin</StatusBadge>}
            {activeSub ? (
              <StatusBadge tone="success">{activeSub.plan.name}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Sem plano</StatusBadge>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Dados cadastrais ── */}
        <Card>
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="E-mail" value={user.email} />
              <Field label="E-mail verificado" value={user.emailVerified ? formatDate(user.emailVerified) : "Não"} />
              <Field label="CPF" value={user.cpf ? formatCpf(user.cpf) : "—"} />
              <Field label="Telefone" value={user.phone ? formatPhone(user.phone) : "—"} />
              <Field label="Nascimento" value={formatDay(user.birthDate)} />
              <Field label="Stripe Customer" value={user.stripeCustomerId ?? "—"} />
              <Field label="Criado em" value={formatDate(user.createdAt)} />
              <Field
                label="Pacote teams"
                value={
                  teamSeat ? (
                    <Link href={`/admin/teams/${teamSeat.teamAccount.id}`} className="text-[var(--primary)] hover:underline">
                      {teamSeat.teamAccount.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="ID" value={<code className="text-xs">{user.id}</code>} />
            </dl>
          </CardContent>
        </Card>

        {/* ── Uso de IA + ações de conta ── */}
        <Card>
          <CardHeader>
            <CardTitle>Conta & uso</CardTitle>
            <CardDescription>
              Uso de IA hoje: <strong>{usage.used}</strong>
              {usage.limit !== null ? ` / ${usage.limit}` : " (admin, sem limite)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateUserAction} className="space-y-3">
              <input type="hidden" name="userId" value={user.id} />
              <label className="block space-y-1 text-sm font-medium">
                Papel
                <Select name="role" defaultValue={user.role}>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </Select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="isBlocked" type="checkbox" defaultChecked={user.isBlocked} /> Bloqueado
              </label>
              <SubmitButton>Salvar conta</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* ── Gerenciar assinatura ── */}
      <Card>
        <CardHeader>
          <CardTitle>Assinatura</CardTitle>
          <CardDescription>Ativar manualmente um plano ou cancelar a assinatura ativa.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
          <form action={activateUserSubscriptionAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="userId" value={user.id} />
            <Select name="planId" required>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </Select>
            <Select name="couponId" defaultValue="">
              <option value="">Sem cupom</option>
              {coupons.map((coupon) => (
                <option key={coupon.id} value={coupon.id}>{coupon.code}</option>
              ))}
            </Select>
            <SubmitButton>Ativar</SubmitButton>
          </form>
          <form action={cancelUserSubscriptionAction}>
            <input type="hidden" name="userId" value={user.id} />
            <SubmitButton variant="outline">Cancelar ativa</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Histórico de assinaturas ── */}
      <Card>
        <CardHeader><CardTitle>Histórico de assinaturas</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr><th className="py-2">Plano</th><th>Status</th><th>Cupom</th><th>Início</th><th>Fim</th></tr>
            </thead>
            <tbody>
              {user.subscriptions.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{s.plan.name}</td>
                  <td><StatusBadge tone={statusTone(s.status)}>{s.status}</StatusBadge></td>
                  <td>{s.coupon?.code ?? "—"}</td>
                  <td>{formatDate(s.startsAt)}</td>
                  <td>{s.endsAt ? formatDate(s.endsAt) : "∞"}</td>
                </tr>
              ))}
              {user.subscriptions.length === 0 && (
                <tr><td colSpan={5} className="py-5 text-center text-[var(--muted-foreground)]">Nenhuma assinatura.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Pagamentos ── */}
      <Card>
        <CardHeader><CardTitle>Transações recentes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr><th className="py-2">Plano</th><th>Provedor</th><th>Status</th><th>Valor</th><th>Pago em</th></tr>
            </thead>
            <tbody>
              {user.paymentTransactions.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{t.plan.name}</td>
                  <td>{t.provider}</td>
                  <td><StatusBadge tone={statusTone(t.status)}>{t.status}</StatusBadge></td>
                  <td>{formatMoney(t.amountCents)}</td>
                  <td>{t.paidAt ? formatDate(t.paidAt) : "—"}</td>
                </tr>
              ))}
              {user.paymentTransactions.length === 0 && (
                <tr><td colSpan={5} className="py-5 text-center text-[var(--muted-foreground)]">Nenhuma transação.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}
