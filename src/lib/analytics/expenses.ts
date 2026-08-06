import type { ExpenseCategory, Prisma } from "@prisma/client";
import { monthKeyInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function monthsAgo(count: number, reference: Date): Date {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() - count);
  return d;
}

/**
 * Despesa = custo real do negócio (`countsAsExpense`). Espelha approvedRevenueWhere() em
 * lib/revenue.ts: uma distribuição de lucro entre sócios é caixa real (entra no Saldo de caixa
 * via getPaidExpenseTotal, que NÃO usa este filtro) mas não é custo — sem o filtro aqui, ela
 * derrubaria o Resultado líquido do mês como se fosse uma despesa operacional.
 */
export function operationalExpenseWhere(): Prisma.ExpenseWhereInput {
  return { countsAsExpense: true };
}

/** Soma de despesas operacionais no período, por `competenceDate` (não por quando foi digitada). */
export async function getExpenseTotal(range?: { from: Date; to: Date }): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { ...operationalExpenseWhere(), ...(range ? { competenceDate: { gte: range.from, lte: range.to } } : {}) },
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

export async function getExpensesByCategory(
  range?: { from: Date; to: Date }
): Promise<{ category: ExpenseCategory; amountCents: number }[]> {
  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    where: { ...operationalExpenseWhere(), ...(range ? { competenceDate: { gte: range.from, lte: range.to } } : {}) },
    _sum: { amountCents: true }
  });
  return grouped
    .map((row) => ({ category: row.category, amountCents: row._sum.amountCents ?? 0 }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * Soma de despesas JÁ PAGAS (`paidAt` preenchido), sem filtro de competência — usada no saldo
 * de caixa acumulado. Despesa lançada mas ainda "a pagar" (`paidAt` vazio) não conta aqui: esse
 * dinheiro ainda não saiu da conta da empresa.
 */
export async function getPaidExpenseTotal(): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { paidAt: { not: null } },
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

export async function getExpenseTrend(months = 12): Promise<{ month: string; amountCents: number }[]> {
  const now = new Date();
  const since = startOfMonthInBrazil(monthsAgo(months - 1, now));
  const expenses = await prisma.expense.findMany({
    where: { ...operationalExpenseWhere(), competenceDate: { gte: since } },
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
