import { PaymentTransactionStatus } from "@prisma/client";
import { getAffiliateCommissionTotal } from "@/lib/affiliates";
import { getAiCostForRange } from "@/lib/analytics/ai-cost";
import { getMarketingSpendForRange } from "@/lib/analytics/campaigns";
import { getCancelReasonBreakdown } from "@/lib/analytics/churn";
import { getExpenseTotal } from "@/lib/analytics/expenses";
import { activeSubscriptionWhere, getMrrCents, getNewPayingCustomersCount } from "@/lib/analytics/revenue";
import { monthKeyInBrazil, startOfMonthInBrazil, startOfNextMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getRevenueSummary } from "@/lib/revenue";

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

export type FinancialSummary = {
  revenueCents: number;
  manualExpenseCents: number;
  affiliateCommissionCents: number;
  /** manualExpenseCents + affiliateCommissionCents — só o que está em BRL. */
  totalExpenseCents: number;
  netCents: number;
  /** netCents / revenueCents, 0 se não houve receita no período. */
  marginPercent: number;
  /**
   * Custo de IA do período, em USD — informativo, NÃO entra em totalExpenseCents/netCents.
   * O resto do DRE é em BRL e não existe cotação de câmbio cadastrada no sistema; somar os
   * dois vTerms exigiria inventar uma taxa, o que seria pior que não somar.
   */
  aiCostUsd: number;
};

/** DRE simplificado do período: receita bruta − despesas (manuais + comissão de afiliado) = resultado. */
export async function getFinancialSummary(range: { from: Date; to: Date }): Promise<FinancialSummary> {
  const [revenue, manualExpenseCents, affiliateCommissionCents, aiCostUsd] = await Promise.all([
    getRevenueSummary(range),
    getExpenseTotal(range),
    getAffiliateCommissionTotal(range),
    getAiCostForRange(range)
  ]);
  const revenueCents = revenue.realCents;
  const totalExpenseCents = manualExpenseCents + affiliateCommissionCents;
  const netCents = revenueCents - totalExpenseCents;
  return {
    revenueCents,
    manualExpenseCents,
    affiliateCommissionCents,
    totalExpenseCents,
    netCents,
    marginPercent: revenueCents > 0 ? netCents / revenueCents : 0,
    aiCostUsd
  };
}

export type FinancialKpis = {
  mrrCents: number;
  arrCents: number;
  activeSubscribers: number;
  arpuCents: number;
  /** Cancelamentos (voluntário + inadimplência) do mês corrente / assinantes ativos hoje. */
  monthlyChurnRate: number;
  /** null = sem churn no mês corrente ainda, a fórmula (ARPU / churn) não é calculável. */
  ltvCents: number | null;
  /** null = nenhum assinante novo no mês corrente, CAC indefinido (divisão por zero). */
  cacCents: number | null;
  ltvToCac: number | null;
  /** Aprovadas vs estornadas, sempre histórico total (amostra mensal é pequena demais). */
  refundRatePercent: number;
};

/** KPIs de SaaS do mês corrente — MRR/ARR/ARPU já existiam espalhados; LTV/CAC são novos. */
export async function getFinancialKpis(): Promise<FinancialKpis> {
  const monthStart = startOfMonthInBrazil();
  const now = new Date();
  const [
    mrrCents,
    activeSubscribers,
    cancelBreakdown,
    marketingSpendCents,
    newPayingCustomers,
    approvedCount,
    refundedCount
  ] = await Promise.all([
    getMrrCents(),
    prisma.userSubscription.count({ where: activeSubscriptionWhere() }),
    getCancelReasonBreakdown({ from: monthStart, to: now }),
    getMarketingSpendForRange({ from: monthStart, to: now }),
    getNewPayingCustomersCount({ from: monthStart, to: now }),
    prisma.paymentTransaction.count({ where: { status: PaymentTransactionStatus.APPROVED } }),
    prisma.paymentTransaction.count({ where: { status: PaymentTransactionStatus.REFUNDED } })
  ]);

  const arrCents = mrrCents * 12;
  const arpuCents = activeSubscribers > 0 ? Math.round(mrrCents / activeSubscribers) : 0;
  const churnedThisMonth = (cancelBreakdown.VOLUNTARY ?? 0) + (cancelBreakdown.PAYMENT_FAILED ?? 0);
  const monthlyChurnRate = activeSubscribers > 0 ? churnedThisMonth / activeSubscribers : 0;
  const ltvCents = monthlyChurnRate > 0 ? Math.round(arpuCents / monthlyChurnRate) : null;
  const cacCents = newPayingCustomers > 0 ? Math.round(marketingSpendCents / newPayingCustomers) : null;
  const ltvToCac = ltvCents !== null && cacCents !== null && cacCents > 0 ? ltvCents / cacCents : null;
  const refundSampleSize = approvedCount + refundedCount;
  const refundRatePercent = refundSampleSize > 0 ? (refundedCount / refundSampleSize) * 100 : 0;

  return { mrrCents, arrCents, activeSubscribers, arpuCents, monthlyChurnRate, ltvCents, cacCents, ltvToCac, refundRatePercent };
}

export type CashFlowMonth = { month: string; revenueCents: number; expenseCents: number; netCents: number };

/** Receita vs despesa (manual + comissão de afiliado) vs resultado, mês a mês — gráfico principal do Caixa. */
export async function getCashFlowTrend(months = 12): Promise<CashFlowMonth[]> {
  const now = new Date();
  const offsets = Array.from({ length: months }, (_, index) => months - 1 - index);
  return Promise.all(
    offsets.map(async (i) => {
      const monthStart = startOfMonthInBrazil(monthsAgo(i, now));
      const monthEnd = i === 0 ? now : startOfNextMonthInBrazil(monthStart);
      const [revenue, manualExpenseCents, affiliateCommissionCents] = await Promise.all([
        getRevenueSummary({ from: monthStart, to: monthEnd }),
        getExpenseTotal({ from: monthStart, to: monthEnd }),
        getAffiliateCommissionTotal({ from: monthStart, to: monthEnd })
      ]);
      const revenueCents = revenue.realCents;
      const expenseCents = manualExpenseCents + affiliateCommissionCents;
      return { month: monthKeyInBrazil(monthStart), revenueCents, expenseCents, netCents: revenueCents - expenseCents };
    })
  );
}
