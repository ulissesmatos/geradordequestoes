import Link from "next/link";
import { AiUsageEventStatus, QuestionStatus, SubscriptionStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    aiSettings
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userSubscription.count({ where: { status: SubscriptionStatus.ACTIVE, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }),
    prisma.question.count(),
    prisma.question.count({ where: { status: QuestionStatus.PENDING_REVIEW } }),
    prisma.question.count({ where: { status: QuestionStatus.APPROVED } }),
    prisma.question.count({ where: { status: QuestionStatus.REJECTED } }),
    prisma.aiUsageEvent.count({ where: { status: AiUsageEventStatus.SUCCESS } }),
    prisma.studyMaterial.count(),
    prisma.paymentTransaction.count(),
    getRevenueSummary(),
    prisma.aiProviderSetting.findUnique({ where: { id: "default" } })
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
      <AdminPageHeader title="Dashboard" description="Visão geral da plataforma." />
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
