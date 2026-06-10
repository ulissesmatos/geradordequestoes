import Link from "next/link";
import { BadgeCheck, CreditCard, IdCard, ShieldCheck, Sparkles, User } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePersonalForm } from "@/components/profile-personal-form";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription, getAiUsageStatus } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const statusMeta: Record<string, { label: string; className: string }> = {
  [SubscriptionStatus.ACTIVE]: { label: "Ativa", className: "bg-emerald-100 text-emerald-800" },
  [SubscriptionStatus.PAST_DUE]: { label: "Pagamento pendente", className: "bg-amber-100 text-amber-800" },
  [SubscriptionStatus.CANCELED]: { label: "Cancelada", className: "bg-rose-100 text-rose-800" }
};

export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { upgrade } = await searchParams;
  const showUpgradeSuccess = upgrade === "success";

  const [subscription, usage, transactions] = await Promise.all([
    getActiveSubscription(user.id),
    getAiUsageStatus(user),
    prisma.paymentTransaction.findMany({
      where: { userId: user.id },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Completude do cadastro fiscal (CPF, telefone, nascimento).
  const fiscalFields = [user.cpf, user.phone, user.birthDate];
  const totalFields = fiscalFields.length;
  const filledCount = fiscalFields.filter(Boolean).length;
  const profileComplete = filledCount === totalFields;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Perfil</h1>
        <p className="text-[var(--muted-foreground)]">Sua conta, assinatura e histórico de pagamentos.</p>
      </div>

      {showUpgradeSuccess && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Upgrade realizado com sucesso!</p>
            <p className="mt-0.5 text-sm text-emerald-700">
              Seu plano foi atualizado e o crédito proporcional do período anterior já foi abatido.
            </p>
          </div>
        </div>
      )}

      {/* ── Conta ── */}
      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-lg font-bold text-[var(--primary)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{user.name ?? "Sem nome"}</p>
            <p className="truncate text-sm text-[var(--muted-foreground)]">{user.email}</p>
          </div>
          {isAdmin && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-soft-foreground)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Administrador
            </span>
          )}
        </CardContent>
      </Card>

      {/* ── Dados pessoais ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5 text-[var(--primary)]" />
            Dados pessoais
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            Usados para emissão de Pix e informações fiscais.
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", profileComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
              Cadastro {filledCount}/{totalFields}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfilePersonalForm
            name={user.name ?? ""}
            cpf={user.cpf}
            phone={user.phone}
            birthDate={user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null}
          />
        </CardContent>
      </Card>

      {/* ── Assinatura ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" />
            Assinatura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isAdmin && !subscription ? (
            <div className="rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary-soft)] p-4">
              <p className="font-semibold text-[var(--primary-soft-foreground)]">Acesso de administrador</p>
              <p className="mt-1 text-sm text-[var(--primary-soft-foreground)]/80">
                Sua conta tem acesso ilimitado a todos os recursos, sem necessidade de assinatura.
              </p>
            </div>
          ) : subscription ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold">{subscription.plan.name}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {formatMoney(subscription.plan.priceCents)} / mês · desde {formatDate(subscription.startsAt)}
                  </p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusMeta[subscription.status]?.className ?? "bg-[var(--muted)]")}>
                  {statusMeta[subscription.status]?.label ?? subscription.status}
                </span>
              </div>

              {subscription.endsAt && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Acesso válido até <strong>{formatDate(subscription.endsAt)}</strong>.
                </p>
              )}

              {usage.limit !== null && (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--muted-foreground)]">Uso de IA hoje</span>
                    <span className="font-semibold">{usage.used} de {usage.limit}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className={cn("h-full rounded-full transition-all", usage.percent >= 90 ? "bg-amber-500" : "bg-[var(--primary)]")}
                      style={{ width: `${Math.min(100, usage.percent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                    <span>O limite diário renova em cerca de <strong>{hoursUntilReset(usage.resetsAt)}h</strong>.</span>
                    {usage.percent >= 100 && (
                      <Link href="/pricing" className="font-semibold text-[var(--primary)] hover:underline">
                        Fazer upgrade para gerar mais →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">Você não tem uma assinatura ativa.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant={subscription || isAdmin ? "outline" : "default"} size="sm">
              <Link href="/pricing">Ver planos</Link>
            </Button>
            {user.stripeCustomerId && (
              <Button asChild variant="outline" size="sm">
                <Link href="/checkout/stripe/portal">
                  <CreditCard className="h-4 w-4" />
                  Gerenciar pagamento
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Histórico de pagamentos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[var(--primary)]" />
            Histórico de pagamentos
          </CardTitle>
          <CardDescription>Últimas transações da sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhum pagamento registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2">Plano</th>
                    <th>Forma</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-[var(--border)]">
                      <td className="py-3 font-medium">{tx.plan.name}</td>
                      <td>{tx.provider === "STRIPE" ? "Cartão" : "Pix"}</td>
                      <td>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          tx.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : tx.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                        )}>
                          {tx.status === "APPROVED" ? "Pago" : tx.status === "PENDING" ? "Pendente" : tx.status}
                        </span>
                      </td>
                      <td>{formatMoney(tx.amountCents)}</td>
                      <td className="text-[var(--muted-foreground)]">{tx.paidAt ? formatDate(tx.paidAt) : formatDate(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function hoursUntilReset(resetsAt: string | undefined) {
  if (!resetsAt) return 24;
  const ms = new Date(resetsAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 3_600_000));
}
