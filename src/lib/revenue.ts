import { PaymentTransactionStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Receita = transação APROVADA e marcada como caixa real (`countsAsRevenue`).
 *
 * A flag existe porque nem toda transação aprovada é dinheiro que entrou: liberação manual de
 * plano pelo admin (cortesia, parceria, conta de teste) nasce fora do caixa, e o admin pode
 * tirar/repor qualquer outra à mão em Admin → Pagamentos. Sem esse recorte o painel mostrava um
 * faturamento que não existe — e um número irreal no dashboard é pior que nenhum número.
 */
export function approvedRevenueWhere(): Prisma.PaymentTransactionWhereInput {
  return { status: PaymentTransactionStatus.APPROVED, countsAsRevenue: true };
}

export type RevenueSummary = {
  /** Soma que o admin considera caixa real. */
  realCents: number;
  /** Soma das transações aprovadas que foram tiradas do caixa (cortesias, testes). */
  excludedCents: number;
  excludedCount: number;
};

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const [real, excluded] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: approvedRevenueWhere(),
      _sum: { amountCents: true }
    }),
    prisma.paymentTransaction.aggregate({
      where: { status: PaymentTransactionStatus.APPROVED, countsAsRevenue: false },
      _sum: { amountCents: true },
      _count: true
    })
  ]);

  return {
    realCents: real._sum.amountCents ?? 0,
    excludedCents: excluded._sum.amountCents ?? 0,
    excludedCount: excluded._count
  };
}
