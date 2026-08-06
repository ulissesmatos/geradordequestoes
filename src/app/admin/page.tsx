import Link from "next/link";
import { AiUsageEventStatus, QuestionStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiCostSummary } from "@/lib/analytics/ai-cost";
import { activeSubscriptionWhere } from "@/lib/analytics/revenue";
import { prisma } from "@/lib/prisma";
import { getRevenueSummary } from "@/lib/revenue";

export default async function AdminHomePage() {
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
    aiCost
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
    getAiCostSummary()
  ]);

  const cards = [
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
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description="Visão geral da plataforma."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/analytics">Ver Analytics completo →</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Receita fora do laço: só ela precisa explicar o que ficou de fora da conta. */}
        <Card>
          <CardHeader>
            <CardTitle>{formatMoney(revenue.realCents)}</CardTitle>
            <CardDescription>
              Receita registrada
              <span className="mt-1 block text-xs">
                {revenue.excludedCount > 0 ? (
                  <>
                    Fora da conta: {formatMoney(revenue.excludedCents)} em {revenue.excludedCount}{" "}
                    {revenue.excludedCount === 1 ? "transação marcada" : "transações marcadas"} como sem receita.{" "}
                    <Link href="/admin/pagamentos" className="underline">
                      Revisar
                    </Link>
                  </>
                ) : (
                  <>
                    Só pagamentos aprovados em gateway.{" "}
                    <Link href="/admin/pagamentos" className="underline">
                      Editar o que conta
                    </Link>
                  </>
                )}
                {" · "}
                <Link href="/admin/analytics/caixa" className="underline">
                  Detalhe por mês (Caixa & DRE)
                </Link>
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle>{value}</CardTitle>
              <CardDescription>{label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>{formatUsd(aiCost.monthUsd)}</CardTitle>
            <CardDescription>
              Custo de IA este mês
              <span className="mt-1 block text-xs">Cobre só geração de questões — chat e material ainda não são medidos.</span>
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{formatUsd(aiCost.totalUsd)}</CardTitle>
            <CardDescription>
              Custo de IA total
              <span className="mt-1 block text-xs">
                <Link href="/admin/analytics/ia" className="underline">
                  Ver tendência e custo por modelo
                </Link>
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>IA ativa: {aiSettings?.provider ?? "OPENAI"}</CardTitle>
          <CardDescription>
            Modelo: {aiSettings?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini"} / Chave{" "}
            {aiSettings?.apiKey || process.env.OPENAI_API_KEY ? "configurada" : "não configurada"}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
