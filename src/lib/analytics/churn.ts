import { SubscriptionCancelReason, SubscriptionStatus } from "@prisma/client";
import { monthKeyInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

/**
 * Tendência mensal de churn DE VERDADE: Voluntário vs Inadimplência (o que foi pedido).
 * SUPERSEDED nunca entra aqui — não é perda de cliente. ADMIN/TEAM ficam de fora do gráfico
 * principal também (são perdas reais, mas de origem operacional diferente) — aparecem só em
 * getRecentCancellations, numa tabela separada.
 */
export async function getChurnTrend(months = 12): Promise<{ month: string; voluntary: number; paymentFailed: number }[]> {
  const now = new Date();
  const since = startOfMonthInBrazil(monthsAgo(months - 1, now));
  const cancellations = await prisma.userSubscription.findMany({
    where: {
      cancelReason: { in: [SubscriptionCancelReason.VOLUNTARY, SubscriptionCancelReason.PAYMENT_FAILED] },
      endsAt: { gte: since }
    },
    select: { endsAt: true, cancelReason: true }
  });

  const buckets = new Map<string, { voluntary: number; paymentFailed: number }>();
  for (const row of cancellations) {
    if (!row.endsAt) continue;
    const key = monthKeyInBrazil(row.endsAt);
    const bucket = buckets.get(key) ?? { voluntary: 0, paymentFailed: 0 };
    if (row.cancelReason === SubscriptionCancelReason.VOLUNTARY) bucket.voluntary += 1;
    else bucket.paymentFailed += 1;
    buckets.set(key, bucket);
  }

  return Array.from({ length: months }, (_, index) => {
    const i = months - 1 - index;
    const key = monthKeyInBrazil(startOfMonthInBrazil(monthsAgo(i, now)));
    return { month: key, ...(buckets.get(key) ?? { voluntary: 0, paymentFailed: 0 }) };
  });
}

/** Contagem por motivo — "UNCLASSIFIED" agrupa cancelamentos anteriores à coluna existir. */
export async function getCancelReasonBreakdown(range?: { from: Date; to: Date }): Promise<Record<string, number>> {
  const grouped = await prisma.userSubscription.groupBy({
    by: ["cancelReason"],
    where: {
      status: SubscriptionStatus.CANCELED,
      ...(range ? { endsAt: { gte: range.from, lte: range.to } } : {})
    },
    _count: { _all: true }
  });
  const result: Record<string, number> = {};
  for (const row of grouped) {
    result[row.cancelReason ?? "UNCLASSIFIED"] = row._count._all;
  }
  return result;
}

export type RecentCancellation = {
  id: string;
  userEmail: string;
  planName: string;
  endsAt: Date | null;
  cancelReason: SubscriptionCancelReason | null;
};

export async function getRecentCancellations(limit = 20): Promise<RecentCancellation[]> {
  const rows = await prisma.userSubscription.findMany({
    where: { status: SubscriptionStatus.CANCELED },
    include: { user: { select: { email: true } }, plan: { select: { name: true } } },
    orderBy: { endsAt: "desc" },
    take: limit
  });
  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    planName: row.plan.name,
    endsAt: row.endsAt,
    cancelReason: row.cancelReason
  }));
}
