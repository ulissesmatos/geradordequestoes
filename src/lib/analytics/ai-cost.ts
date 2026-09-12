import { monthKeyInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

export type TokenTotals = { inputTokens: number; outputTokens: number };

/**
 * Soma a partir de AiGenerationLog — cobre chat, material e geração de questões, então o
 * número já é o custo real de IA, não só de uma parte dele.
 */
export async function getAiCostSummary(): Promise<{
  monthUsd: number;
  totalUsd: number;
  monthTokens: TokenTotals;
  totalTokens: TokenTotals;
}> {
  const monthStart = startOfMonthInBrazil();
  const [monthAgg, totalAgg] = await Promise.all([
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true }
    }),
    prisma.aiGenerationLog.aggregate({
      _sum: { costUsd: true, inputTokens: true, outputTokens: true }
    })
  ]);
  return {
    monthUsd: monthAgg._sum.costUsd?.toNumber() ?? 0,
    totalUsd: totalAgg._sum.costUsd?.toNumber() ?? 0,
    monthTokens: { inputTokens: monthAgg._sum.inputTokens ?? 0, outputTokens: monthAgg._sum.outputTokens ?? 0 },
    totalTokens: { inputTokens: totalAgg._sum.inputTokens ?? 0, outputTokens: totalAgg._sum.outputTokens ?? 0 }
  };
}

/** Custo de IA (USD) num período arbitrário — usado pelo DRE, que soma por mês/intervalo livre. */
export async function getAiCostForRange(range: { from: Date; to: Date }): Promise<number> {
  const agg = await prisma.aiGenerationLog.aggregate({
    where: { createdAt: { gte: range.from, lte: range.to } },
    _sum: { costUsd: true }
  });
  return agg._sum.costUsd?.toNumber() ?? 0;
}

export async function getAiCostTrend(
  months = 12
): Promise<{ month: string; costUsd: number; inputTokens: number; outputTokens: number }[]> {
  const now = new Date();
  const since = startOfMonthInBrazil(monthsAgo(months - 1, now));
  const logs = await prisma.aiGenerationLog.findMany({
    where: { createdAt: { gte: since }, costUsd: { not: null } },
    select: { createdAt: true, costUsd: true, inputTokens: true, outputTokens: true }
  });

  const buckets = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number }>();
  for (const log of logs) {
    const key = monthKeyInBrazil(log.createdAt);
    const bucket = buckets.get(key) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    bucket.costUsd += log.costUsd?.toNumber() ?? 0;
    bucket.inputTokens += log.inputTokens ?? 0;
    bucket.outputTokens += log.outputTokens ?? 0;
    buckets.set(key, bucket);
  }

  return Array.from({ length: months }, (_, index) => {
    const i = months - 1 - index;
    const key = monthKeyInBrazil(startOfMonthInBrazil(monthsAgo(i, now)));
    return { month: key, ...(buckets.get(key) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 }) };
  });
}

/** Custo por modelo — a pergunta que motivou esta feature inteira (ex.: Terra vs Luna, com dado real). */
export async function getAiCostByModel(range?: { from: Date; to: Date }): Promise<{ model: string; costUsd: number; count: number }[]> {
  const grouped = await prisma.aiGenerationLog.groupBy({
    by: ["model"],
    where: {
      costUsd: { not: null },
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {})
    },
    _sum: { costUsd: true },
    _count: { _all: true }
  });
  return grouped
    .map((row) => ({ model: row.model ?? "desconhecido", costUsd: row._sum.costUsd?.toNumber() ?? 0, count: row._count._all }))
    .sort((a, b) => b.costUsd - a.costUsd);
}
