import Link from "next/link";
import { CopyLinkButton, WithdrawalForm } from "@/components/affiliate-panel";
import { Panel, PanelHeader } from "@/components/saasable/saasable-panel";
import { Button } from "@/components/ui/button";
import { affiliateLinkUrl, getAffiliateOverview, MIN_WITHDRAWAL_CENTS } from "@/lib/affiliates";
import { formatDateBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { cn } from "@/lib/utils";

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
      <div className="dm-ready mx-auto w-full max-w-3xl space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/perfil">
            <i className="ti ti-arrow-left text-base leading-none" />
            Voltar ao perfil
          </Link>
        </Button>
        <Panel>
          <div className="flex flex-col items-center gap-3 p-4 text-center">
            <i className="ti ti-affiliate text-4xl leading-none text-primary-500" />
            <p className="subtitle1 text-theme-text-primary">Programa de afiliados por convite</p>
            <p className="max-w-md body2 text-theme-text-secondary">
              {overview
                ? "Sua participação no programa está desativada no momento. Fale com o suporte para mais detalhes."
                : "O programa de afiliados está disponível apenas para contas convidadas pela equipe. Interessado em divulgar a plataforma e ganhar comissão? Fale com o suporte."}
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const { profile, balance, referralsCount, paidReferralsCount, commissions, withdrawals } = overview;
  const link = affiliateLinkUrl(profile.code);

  return (
    <div className="dm-ready mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="h1">Programa de afiliados</h1>
        <p className="body2 text-theme-text-secondary">
          Divulgue seu link e ganhe <strong>{profile.commissionPercent}%</strong> de cada pagamento dos
          alunos que você indicar.
        </p>
      </div>

      {/* ── Link de divulgação ── */}
      <Panel>
        <PanelHeader
          icon="ti-link"
          title="Seu link de indicação"
          description="Quem acessar por este link e assinar (em até 30 dias) conta como sua indicação."
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            className="min-w-0 flex-1 rounded-xl border border-theme-divider bg-theme-bg-default px-3 py-2 font-mono text-xs text-theme-text-secondary"
          />
          <CopyLinkButton link={link} />
        </div>
      </Panel>

      {/* ── Números ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={String(referralsCount)} label="Indicados cadastrados" />
        <Stat value={String(paidReferralsCount)} label="Indicados pagantes" />
        <Stat value={formatMoney(balance.totalEarnedCents)} label="Total ganho" />
        <Stat value={formatMoney(balance.availableCents)} label="Saldo disponível" highlight />
      </div>

      {/* ── Saque ── */}
      <Panel>
        <PanelHeader
          icon="ti-cash-banknote"
          title="Solicitar saque"
          description={`O pagamento é feito via Pix pela equipe. Saque mínimo de ${formatMoney(MIN_WITHDRAWAL_CENTS)}.`}
        />
        <WithdrawalForm availableCents={balance.availableCents} minCents={MIN_WITHDRAWAL_CENTS} />
      </Panel>

      {/* ── Histórico de saques ── */}
      {withdrawals.length > 0 && (
        <Panel>
          <h4 className="h4">Saques</h4>
          <div className="space-y-2">
            {withdrawals.map((withdrawal) => {
              const meta = withdrawalStatusMeta[withdrawal.status] ?? withdrawalStatusMeta.REQUESTED;
              return (
                <div
                  key={withdrawal.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-theme-divider p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{formatMoney(withdrawal.amountCents)}</p>
                    <p className="truncate caption2 text-theme-text-secondary">
                      {formatDate(withdrawal.createdAt)} · Pix: {withdrawal.pixKey}
                      {withdrawal.note ? ` · ${withdrawal.note}` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 caption", meta.className)}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ── Comissões recentes ── */}
      <Panel>
        <PanelHeader icon="ti-users" title="Comissões recentes" />
        {commissions.length === 0 ? (
          <p className="body2 text-theme-text-secondary">
            Nenhuma comissão ainda. Compartilhe seu link — quando um indicado pagar um plano, sua
            comissão aparece aqui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left caption2 text-theme-text-secondary">
                <tr>
                  <th className="py-2">Data</th>
                  <th>Pagamento</th>
                  <th>%</th>
                  <th>Comissão</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-t border-theme-divider">
                    <td className="py-2 text-theme-text-secondary">{formatDate(commission.createdAt)}</td>
                    <td>{formatMoney(commission.baseAmountCents)}</td>
                    <td>{commission.percent}%</td>
                    <td className="font-semibold text-emerald-700">{formatMoney(commission.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-theme-bg-paper p-4", highlight ? "border-primary-500" : "border-theme-divider")}>
      <p className="h4">{value}</p>
      <p className="mt-0.5 caption text-theme-text-secondary">{label}</p>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return formatDateBR(date, "medium");
}
