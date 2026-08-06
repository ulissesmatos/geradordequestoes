import { PaymentTransactionStatus, Prisma, SubscriptionStatus } from "@prisma/client";
import { monthKeyInBrazil, startOfMonthInBrazil, startOfNextMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/** Mesmo filtro usado em "Assinantes ativos" no Dashboard — assinatura vigente na data dada. */
export function activeSubscriptionWhere(reference: Date = new Date()): Prisma.UserSubscriptionWhereInput {
  return {
    status: SubscriptionStatus.ACTIVE,
    OR: [{ endsAt: null }, { endsAt: { gt: reference } }]
  };
}

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

/** MRR de agora: soma do preço mensal de toda assinatura ativa (todo plano do app é mensal). */
export async function getMrrCents(): Promise<number> {
  const subscriptions = await prisma.userSubscription.findMany({
    where: activeSubscriptionWhere(),
    select: { plan: { select: { priceCents: true } } }
  });
  return subscriptions.reduce((sum, sub) => sum + sub.plan.priceCents, 0);
}

/**
 * MRR reconstruído mês a mês via startsAt/endsAt (não via `status`, que só reflete hoje).
 * Aproximação aceita: como PAST_DUE nunca fecha endsAt, pode superestimar levemente em meses
 * com inadimplência não resolvida — o número "MRR hoje" (getMrrCents) não sofre disso.
 */
export async function getMrrTrend(months = 12): Promise<{ month: string; mrrCents: number }[]> {
  const now = new Date();
  const offsets = Array.from({ length: months }, (_, index) => months - 1 - index);
  return Promise.all(
    offsets.map(async (i) => {
      const monthStart = startOfMonthInBrazil(monthsAgo(i, now));
      // Mês corrente: snapshot em "agora". Meses passados: snapshot no fim do mês.
      const asOf = i === 0 ? now : startOfNextMonthInBrazil(monthStart);
      const subscriptions = await prisma.userSubscription.findMany({
        where: { startsAt: { lte: asOf }, OR: [{ endsAt: null }, { endsAt: { gt: asOf } }] },
        select: { plan: { select: { priceCents: true } } }
      });
      return { month: monthKeyInBrazil(monthStart), mrrCents: subscriptions.reduce((sum, s) => sum + s.plan.priceCents, 0) };
    })
  );
}

export async function getRevenueByPlan(range?: { from: Date; to: Date }): Promise<{ planName: string; amountCents: number }[]> {
  const grouped = await prisma.paymentTransaction.groupBy({
    by: ["planId"],
    where: {
      status: PaymentTransactionStatus.APPROVED,
      countsAsRevenue: true,
      ...(range ? { paidAt: { gte: range.from, lte: range.to } } : {})
    },
    _sum: { amountCents: true }
  });
  const plans = await prisma.subscriptionPlan.findMany({
    where: { id: { in: grouped.map((row) => row.planId) } },
    select: { id: true, name: true }
  });
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));
  return grouped
    .map((row) => ({ planName: planNameById.get(row.planId) ?? "Desconhecido", amountCents: row._sum.amountCents ?? 0 }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function getPlanDistribution(): Promise<{ planName: string; count: number }[]> {
  const grouped = await prisma.userSubscription.groupBy({
    by: ["planId"],
    where: activeSubscriptionWhere(),
    _count: { _all: true }
  });
  const plans = await prisma.subscriptionPlan.findMany({
    where: { id: { in: grouped.map((row) => row.planId) } },
    select: { id: true, name: true }
  });
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));
  return grouped
    .map((row) => ({ planName: planNameById.get(row.planId) ?? "Desconhecido", count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Novos assinantes por mês = usuários na sua PRIMEIRA UserSubscription (não conta upgrade nem
 * renovação, que criam uma linha nova pro mesmo usuário — ver SubscriptionCancelReason.SUPERSEDED).
 */
export async function getNewSubscribersTrend(months = 12): Promise<{ month: string; count: number }[]> {
  const firstSubscriptionByUser = await prisma.userSubscription.groupBy({
    by: ["userId"],
    _min: { createdAt: true }
  });
  const buckets = new Map<string, number>();
  for (const row of firstSubscriptionByUser) {
    if (!row._min.createdAt) continue;
    const key = monthKeyInBrazil(row._min.createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const i = months - 1 - index;
    const key = monthKeyInBrazil(startOfMonthInBrazil(monthsAgo(i, now)));
    return { month: key, count: buckets.get(key) ?? 0 };
  });
}

/**
 * Novos assinantes PAGANTES num intervalo arbitrário (não em buckets mensais) — mesma regra de
 * getNewSubscribersTrend (primeira UserSubscription do usuário), usada como denominador do CAC.
 */
export async function getNewPayingCustomersCount(range: { from: Date; to: Date }): Promise<number> {
  const firstSubscriptionByUser = await prisma.userSubscription.groupBy({
    by: ["userId"],
    _min: { createdAt: true }
  });
  return firstSubscriptionByUser.filter(
    (row) => row._min.createdAt && row._min.createdAt >= range.from && row._min.createdAt <= range.to
  ).length;
}

/** Conversão simples trial → pago: usuários com pelo menos 1 transação aprovada / total. */
export async function getTrialToPayConversion(): Promise<{ payingUsers: number; totalUsers: number; rate: number }> {
  const [totalUsers, payingUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { paymentTransactions: { some: { status: PaymentTransactionStatus.APPROVED, countsAsRevenue: true } } }
    })
  ]);
  return { payingUsers, totalUsers, rate: totalUsers > 0 ? payingUsers / totalUsers : 0 };
}
