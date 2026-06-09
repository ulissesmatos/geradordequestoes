import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export async function Paywall() {
  const [plans, pricingContent] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }]
    }),
    getPricingContent()
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <LockKeyhole className="h-8 w-8 text-[var(--primary)]" />
        <h1 className="mt-4 text-3xl font-bold">{pricingContent.paywallTitle}</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
          {pricingContent.paywallDescription}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-4 space-y-2 text-sm">
                {planFeatures(plan).map((feature) => <p key={feature}>- {feature}</p>)}
              </div>
              <div className="mt-4 grid gap-2">
                <Button asChild>
                  <Link href={`/checkout/stripe?plan=${plan.slug}`}>Assinar com cartão</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/checkout/mercado-pago?plan=${plan.slug}`}>Pagar com Pix</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100);
}
