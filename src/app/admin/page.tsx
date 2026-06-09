import { AiUsageEventStatus, PaymentTransactionStatus, QuestionStatus, SubscriptionStatus } from "@prisma/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

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
    prisma.paymentTransaction.aggregate({
      where: { status: PaymentTransactionStatus.APPROVED },
      _sum: { amountCents: true }
    }),
    prisma.aiProviderSetting.findUnique({ where: { id: "default" } })
  ]);

  const cards = [
    ["Usuários", users],
    ["Assinantes ativos", activeSubscriptions],
    ["Receita registrada", formatMoney(revenue._sum.amountCents ?? 0)],
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
      <h1 className="text-3xl font-bold">Dashboard admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
