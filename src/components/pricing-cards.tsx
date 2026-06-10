import type { ReactNode } from "react";
import { BadgeCheck, Check, Sparkles } from "lucide-react";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  marketingSubtitle?: string | null;
  ctaText?: string;
  isHighlighted?: boolean;
  features: string[];
  priceCents: number;
  aiGenerationsPerDay: number;
  stripePriceId?: string | null;
};

export type UpgradePreview = {
  currentPlanName: string;
  currentPriceCents: number;
  newPriceCents: number;
  /** Crédito proporcional do plano atual. null = Stripe calcula automaticamente. */
  creditCents: number | null;
  /** Valor a pagar agora. null = Stripe calcula automaticamente. */
  dueCents: number | null;
  /** Data de fim do ciclo atual (ISO) para Pix. null = ciclo recorrente. */
  cycleEndDate: string | null;
  isRecurring: boolean;
};

export function PricingCards({
  plans,
  compact = false,
  headline = "Planos para estudar com IA todos os dias.",
  subheadline = "Escolha um plano ativo e libere a geração de questões, simulados e revisões pelo painel.",
  hasStripe = true,
  hasPix = true,
  currentPlan = null
}: {
  plans: PricingPlan[];
  compact?: boolean;
  headline?: string;
  subheadline?: string;
  hasStripe?: boolean;
  hasPix?: boolean;
  /** Plano da assinatura ativa do usuário logado: trava re-assinatura e downgrade. */
  currentPlan?: {
    id: string;
    name: string;
    priceCents: number;
    endsAt: string | null;
    isRecurring: boolean;
  } | null;
}) {
  return (
    <section className={cn("w-full", compact ? "py-12" : "py-16 lg:py-24")}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <Badge variant="secondary">Planos</Badge>
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">{headline}</h2>
            <p className="mx-auto max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              {subheadline}
            </p>
          </div>
        </div>

        {plans.length === 0 ? (
          <Card className="mx-auto mt-12 max-w-2xl">
            <CardContent className="p-6 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum plano ativo no momento. Volte em breve ou fale com o administrador.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 pt-12 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const highlighted = Boolean(plan.isHighlighted);
              const priceFormatted = formatMoney(plan.priceCents);
              const relation: "current" | "upgrade" | "downgrade" | null = currentPlan
                ? plan.id === currentPlan.id
                  ? "current"
                  : plan.priceCents > currentPlan.priceCents
                    ? "upgrade"
                    : "downgrade"
                : null;
              const upgradePreview: UpgradePreview | null =
                relation === "upgrade" && currentPlan
                  ? buildUpgradePreview(currentPlan, plan.priceCents)
                  : null;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "rounded-md bg-[var(--surface)]",
                    highlighted && "border-[var(--primary)] shadow-xl shadow-[var(--primary)]/10"
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-xl font-semibold">{plan.name}</CardTitle>
                      {highlighted && (
                        <Badge>
                          <Sparkles className="mr-1 h-3 w-3" />
                          Popular
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="min-h-10 leading-6">
                      {plan.marketingSubtitle || plan.description || "Geração de questões com IA para rotina de estudos."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-7">
                      <p className="flex items-end gap-2">
                        <span className="text-4xl font-semibold tracking-tight">{priceFormatted}</span>
                        <span className="pb-1 text-sm text-[var(--muted-foreground)]">/ mês</span>
                      </p>
                      <div className="space-y-4 text-sm">
                        {plan.features.map((feature) => (
                          <Feature key={feature}>{feature}</Feature>
                        ))}
                      </div>
                      {relation === "current" ? (
                        <Button variant="outline" className="w-full" disabled>
                          <BadgeCheck className="h-4 w-4" />
                          Plano atual
                        </Button>
                      ) : relation === "downgrade" ? (
                        <div className="space-y-1.5">
                          <Button variant="outline" className="w-full" disabled>
                            Inferior ao plano atual
                          </Button>
                          <p className="text-center text-xs text-[var(--muted-foreground)]">
                            Para reduzir o plano, cancele a assinatura atual no perfil.
                          </p>
                        </div>
                      ) : (
                        <PaymentMethodModal
                          planSlug={plan.slug}
                          planName={plan.name}
                          planPrice={priceFormatted}
                          highlighted={highlighted}
                          ctaText={relation === "upgrade" ? "Fazer upgrade" : plan.ctaText}
                          isUpgrade={relation === "upgrade"}
                          upgradePreview={upgradePreview}
                          hasStripe={hasStripe && !!plan.stripePriceId}
                          hasPix={hasPix}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Feature({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
      <span>{children}</span>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100);
}

function buildUpgradePreview(
  current: { name: string; priceCents: number; endsAt: string | null; isRecurring: boolean },
  newPriceCents: number
): UpgradePreview {
  if (current.isRecurring) {
    return {
      currentPlanName: current.name,
      currentPriceCents: current.priceCents,
      newPriceCents,
      creditCents: null,
      dueCents: null,
      cycleEndDate: null,
      isRecurring: true
    };
  }
  // Pix: calcula crédito proporcional dos dias restantes do ciclo de 30 dias.
  const endsAt = current.endsAt ? new Date(current.endsAt) : null;
  const msLeft = endsAt ? endsAt.getTime() - Date.now() : 0;
  const daysLeft = msLeft > 0 ? Math.min(30, msLeft / 86_400_000) : 0;
  const creditCents = Math.round(current.priceCents * (daysLeft / 30));
  const dueCents = Math.max(newPriceCents - creditCents, 100);
  return {
    currentPlanName: current.name,
    currentPriceCents: current.priceCents,
    newPriceCents,
    creditCents,
    dueCents,
    cycleEndDate: current.endsAt,
    isRecurring: false
  };
}

