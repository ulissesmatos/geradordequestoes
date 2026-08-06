import type { ExpenseCategory } from "@prisma/client";
import { monthKeyInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

/** Soma de despesas manuais no período, por `competenceDate` (não por quando foi digitada). */
export async function getExpenseTotal(range?: { from: Date; to: Date }): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: range ? { competenceDate: { gte: range.from, lte: range.to } } : {},
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

export async function getExpensesByCategory(
  range?: { from: Date; to: Date }
): Promise<{ category: ExpenseCategory; amountCents: number }[]> {
  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    where: range ? { competenceDate: { gte: range.from, lte: range.to } } : {},
    _sum: { amountCents: true }
  });
  return grouped
    .map((row) => ({ category: row.category, amountCents: row._sum.amountCents ?? 0 }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function getExpenseTrend(months = 12): Promise<{ month: string; amountCents: number }[]> {
  const now = new Date();
  const since = startOfMonthInBrazil(monthsAgo(months - 1, now));
  const expenses = await prisma.expense.findMany({
    where: { competenceDate: { gte: since } },
    select: { competenceDate: true, amountCents: true }
  });

  const buckets = new Map<string, number>();
  for (const expense of expenses) {
    const key = monthKeyInBrazil(expense.competenceDate);
    buckets.set(key, (buckets.get(key) ?? 0) + expense.amountCents);
  }

  return Array.from({ length: months }, (_, index) => {
    const i = months - 1 - index;
    const key = monthKeyInBrazil(startOfMonthInBrazil(monthsAgo(i, now)));
    return { month: key, amountCents: buckets.get(key) ?? 0 };
  });
}
