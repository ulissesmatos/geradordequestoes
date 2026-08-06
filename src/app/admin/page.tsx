import Link from "next/link";
import { AiUsageEventStatus, QuestionStatus } from "@prisma/client";
import { Landmark, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatTile } from "@/components/performance-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiCostSummary } from "@/lib/analytics/ai-cost";
import { getCashBalance, getFinancialSummary } from "@/lib/analytics/financials";
import { activeSubscriptionWhere } from "@/lib/analytics/revenue";
import { formatMonthKeyBR, monthKeyInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getRevenueSummary } from "@/lib/revenue";

export default async function AdminHomePage() {
  const monthStart = startOfMonthInBrazil();
  const now = new Date();

  const [
    users,
    activeSubscriptions,
    questions,
    pending,
    approved,
    rejected,
    aiUsage,
    materials,
    transactions,
    revenue,
    aiSettings,
    aiCost,
    cashBalance,
    monthSummary
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userSubscription.count({ where: activeSubscriptionWhere() }),
    prisma.question.count(),
    prisma.question.count({ where: { status: QuestionStatus.PENDING_REVIEW } }),
    prisma.question.count({ where: { status: QuestionStatus.APPROVED } }),
    prisma.question.count({ where: { status: QuestionStatus.REJECTED } }),
    prisma.aiUsageEvent.count({ where: { status: AiUsageEventStatus.SUCCESS } }),
    prisma.studyMaterial.count(),
    prisma.paymentTransaction.count(),
    getRevenueSummary(),
    prisma.aiProviderSetting.findUnique({ where: { id: "default" } }),
    getAiCostSummary(),
    getCashBalance(),
    getFinancialSummary({ from: monthStart, to: now })
  ]);

  const monthLabel = formatMonthKeyBR(monthKeyInBrazil(now));

  const platformStats: [string, number][] = [
    ["Usuários", users],
    ["Assinantes ativos", activeSubscriptions],
    ["Questões", questions],
    ["Pendentes", pending],
    ["Aprovadas", approved],
    ["Rejeitadas", rejected],
    ["Usos IA", aiUsage],
    ["Materiais IA", materials],
    ["Transações", transactions]
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Dashboard"
        description="Visão geral da plataforma."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/analytics">Ver Analytics completo →</Link>
          </Button>
        }
      />

      {/* Hero: saldo de caixa acumulado — o único número "estilo extrato bancário" da página,
          por isso fica sozinho, maior que tudo o resto (ver skill de dataviz: hero figure,
          exatamente 1 por view). Tom vermelho só se o saldo for negativo — cor de estado, não
          decoração. */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Saldo de caixa acumulado</p>
            <p className={`mt-1 text-5xl font-bold ${cashBalance.cashBalanceCents < 0 ? "text-[var(--destructive)]" : ""}`}>
              {formatMoney(cashBalance.cashBalanceCents)}
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {formatMoney(cashBalance.revenueCents)} recebido − {formatMoney(cashBalance.paidExpenseCents)} em despesas pagas
              {cashBalance.paidAffiliateWithdrawalCents > 0 && <> − {formatMoney(cashBalance.paidAffiliateWithdrawalCents)} em saques de afiliado</>}
              , desde o início.{" "}
              <Link href="/admin/analytics/caixa" className="font-medium underline underline-offset-2">
                Ver Caixa & DRE completo →
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Financeiro do mês — cada label deixa "do mês" explícito, e o rótulo da seção repete o
          mês por extenso, pra nunca mais confundir com o saldo acumulado acima ou com o
          histórico total. */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Financeiro · {monthLabel}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={TrendingUp}
            value={formatMoney(monthSummary.revenueCents)}
            label="Receita do mês"
            hint="Só pagamentos recebidos neste mês"
          />
          <StatTile
            icon={Receipt}
            value={formatMoney(monthSummary.totalExpenseCents)}
            label="Despesas do mês"
            hint="Lançadas + comissão de afiliados"
          />
          <StatTile
            icon={Scale}
            tone={monthSummary.netCents >= 0 ? "positive" : "negative"}
            value={formatMoney(monthSummary.netCents)}
            label="Resultado do mês"
            hint={`Margem: ${formatPercent(monthSummary.marginPercent)}`}
          />
          <StatTile
            icon={Landmark}
            value={formatMoney(revenue.realCents)}
            label="Receita total (histórico)"
            hint={
              revenue.excludedCount > 0
                ? `${formatMoney(revenue.excludedCents)} fora da conta — Revisar em Pagamentos`
                : "Soma de todo pagamento aprovado, desde sempre"
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Plataforma</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {platformStats.map(([label, value]) => (
            <StatTile key={label} value={String(value)} label={label} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Inteligência artificial</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile value={formatUsd(aiCost.monthUsd)} label="Custo de IA (mês)" hint="Cobre só geração de questões" />
          <StatTile value={formatUsd(aiCost.totalUsd)} label="Custo de IA (total)" hint="Ver tendência em Analytics → Custo de IA" />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{aiSettings?.provider ?? "OPENAI"}</CardTitle>
              <CardDescription>
                Modelo: {aiSettings?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini"} / Chave{" "}
                {aiSettings?.apiKey || process.env.OPENAI_API_KEY ? "configurada" : "não configurada"}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value * 100) + "%";
}
