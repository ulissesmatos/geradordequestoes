import { LockKeyhole } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export async function Paywall() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" }
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <LockKeyhole className="h-8 w-8 text-[var(--primary)]" />
        <h1 className="mt-4 text-3xl font-bold">Assinatura necessária</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
          A geração de questões, estudos, simulados e revisão por IA ficam disponíveis para usuários com plano ativo.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(plan.priceCents)}</p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {plan.aiGenerationsPerDay} gerações de IA por dia
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">
        Nesta versão, o administrador ativa a assinatura manualmente em Usuários.
      </p>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100);
}
