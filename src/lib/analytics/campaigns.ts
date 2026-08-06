import { ExpenseCategory, type MarketingChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CampaignSpend = {
  id: string;
  name: string;
  channel: MarketingChannel;
  startDate: Date;
  endDate: Date | null;
  budgetCents: number | null;
  isActive: boolean;
  spentCents: number;
};

/** Gasto real de cada campanha = soma das Expense linkadas — sem campo duplicado na campanha. */
export async function getCampaignSpendSummary(): Promise<CampaignSpend[]> {
  const campaigns = await prisma.marketingCampaign.findMany({
    orderBy: { startDate: "desc" },
    include: { expenses: { select: { amountCents: true } } }
  });
  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    budgetCents: campaign.budgetCents,
    isActive: campaign.isActive,
    spentCents: campaign.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  }));
}

/**
 * Gasto de marketing no período (categoria MARKETING, linkado a campanha ou não) — base do
 * cálculo de CAC. Agregado por período, não por campanha: sem atribuição de assinante →
 * campanha (via UTM) ainda não dá pra saber qual campanha trouxe qual cliente.
 */
export async function getMarketingSpendForRange(range: { from: Date; to: Date }): Promise<number> {
  const agg = await prisma.expense.aggregate({
    where: { category: ExpenseCategory.MARKETING, competenceDate: { gte: range.from, lte: range.to } },
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}
