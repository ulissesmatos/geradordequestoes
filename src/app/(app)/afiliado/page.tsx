import Link from "next/link";
import { ArrowLeft, Banknote, Handshake, Link2, Users } from "lucide-react";
import { CopyLinkButton, WithdrawalForm } from "@/components/affiliate-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { affiliateLinkUrl, getAffiliateOverview, MIN_WITHDRAWAL_CENTS } from "@/lib/affiliates";
import { requireUser } from "@/lib/guards";

const withdrawalStatusMeta: Record<string, { label: string; className: string }> = {
  REQUESTED: { label: "Aguardando", className: "bg-amber-100 text-amber-800" },
  PAID: { label: "Pago", className: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Recusado", className: "bg-rose-100 text-rose-800" }
};

export default async function AffiliatePage() {
  const user = await requireUser();
  const overview = await getAffiliateOverview(user.id);

  if (!overview || !overview.profile.isActive) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/perfil">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao perfil
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Handshake className="h-10 w-10 text-[var(--primary)]" />
            <p className="text-lg font-semibold">Programa de afiliados por convite</p>
            <p className="max-w-md text-sm text-[var(--muted-foreground)]">
              {overview
                ? "Sua participação no programa está desativada no momento. Fale com o suporte para mais detalhes."
                : "O programa de afiliados está disponível apenas para contas convidadas pela equipe. Interessado em divulgar a plataforma e ganhar comissão? Fale com o suporte."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile, balance, referralsCount, paidReferralsCount, commissions, withdrawals } = overview;
  const link = affiliateLinkUrl(profile.code);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Programa de afiliados</h1>
        <p className="text-[var(--muted-foreground)]">
          Divulgue seu link e ganhe <strong>{profile.commissionPercent}%</strong> de cada pagamento dos
          alunos que você indicar.
        </p>
      </div>

      {/* ── Link de divulgação ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[var(--primary)]" />
            Seu link de indicação
          </CardTitle>
          <CardDescription>
            Quem acessar por este link e assinar (em até 30 dias) conta como sua indicação.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]"
          />
          <CopyLinkButton link={link} />
        </CardContent>
      </Card>

      {/* ── Números ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={String(referralsCount)} label="Indicados cadastrados" />
        <Stat value={String(paidReferralsCount)} label="Indicados pagantes" />
        <Stat value={formatMoney(balance.totalEarnedCents)} label="Total ganho" />
        <Stat value={formatMoney(balance.availableCents)} label="Saldo disponível" highlight />
      </div>

      {/* ── Saque ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[var(--primary)]" />
            Solicitar saque
          </CardTitle>
          <CardDescription>
            O pagamento é feito via Pix pela equipe. Saque mínimo de {formatMoney(MIN_WITHDRAWAL_CENTS)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WithdrawalForm availableCents={balance.availableCents} minCents={MIN_WITHDRAWAL_CENTS} />
        </CardContent>
      </Card>

      {/* ── Histórico de saques ── */}
      {withdrawals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {withdrawals.map((withdrawal) => {
              const meta = withdrawalStatusMeta[withdrawal.status] ?? withdrawalStatusMeta.REQUESTED;
              return (
                <div
                  key={withdrawal.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{formatMoney(withdrawal.amountCents)}</p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {formatDate(withdrawal.createdAt)} · Pix: {withdrawal.pixKey}
                      {withdrawal.note ? ` · ${withdrawal.note}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Comissões recentes ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--primary)]" />
            Comissões recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhuma comissão ainda. Compartilhe seu link — quando um indicado pagar um plano, sua
              comissão aparece aqui.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2">Data</th>
                    <th>Pagamento</th>
                    <th>%</th>
                    <th>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((commission) => (
                    <tr key={commission.id} className="border-t border-[var(--border)]">
                      <td className="py-2 text-[var(--muted-foreground)]">{formatDate(commission.createdAt)}</td>
                      <td>{formatMoney(commission.baseAmountCents)}</td>
                      <td>{commission.percent}%</td>
                      <td className="font-semibold text-emerald-700">{formatMoney(commission.amountCents)}</td>
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

function Stat({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius)] border p-4 ${
        highlight ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}
