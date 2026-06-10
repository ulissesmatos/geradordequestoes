import { LockKeyhole } from "lucide-react";
import { Check } from "lucide-react";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export async function Paywall() {
  const [plans, pricingContent, settings] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }]
    }),
    getPricingContent(),
    prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } })
  ]);

  const hasStripe = !!settings?.stripeSecretKey;
  const hasPix = !!settings?.mercadoPagoAccessToken;

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
        {plans.map((plan) => {
          const features = planFeatures(plan);
          const priceFormatted = formatMoney(plan.priceCents);
          return (
            <Card key={plan.id} className={plan.isHighlighted ? "border-[var(--primary)]" : undefined}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-2xl font-bold">
                  {priceFormatted}
                  <span className="ml-1 text-sm font-normal text-[var(--muted-foreground)]">/ mês</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {features.map((feature) => (
                    <div key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <PaymentMethodModal
                  planSlug={plan.slug}
                  planName={plan.name}
                  planPrice={priceFormatted}
                  highlighted={plan.isHighlighted}
                  hasStripe={hasStripe && !!plan.stripePriceId}
                  hasPix={hasPix}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
