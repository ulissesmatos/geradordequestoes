import type { ReactNode } from "react";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { Button } from "@/components/ui/button";
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
    <section className={cn("w-full", compact ? "py-12" : "common-section")}>
      <div className="saasable-container max-w-6xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="inline-flex items-center rounded-full border border-theme-divider bg-theme-bg-paper px-3 py-1.5 caption text-theme-text-secondary">
            Planos
          </div>
          <h2 className="h2 max-w-2xl">{headline}</h2>
          <h6 className="h6 max-w-2xl text-theme-text-secondary font-normal">{subheadline}</h6>
        </div>

        {plans.length === 0 ? (
          <div className="mx-auto mt-12 max-w-2xl rounded-3xl bg-theme-bg-paper p-6 text-center body1 text-theme-text-secondary">
            Nenhum plano ativo no momento. Volte em breve ou fale com o administrador.
          </div>
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
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl sm:rounded-3xl bg-theme-bg-paper border p-6 sm:p-8 flex flex-col gap-6",
                    highlighted ? "border-primary-500 shadow-[0_20px_45px_-20px_rgba(10,98,104,0.35)]" : "border-theme-divider"
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="h4">{plan.name}</h4>
                      {highlighted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-2.5 py-1 caption text-white">
                          <i className="ti ti-sparkles text-xs leading-none" />
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="min-h-10 body2 text-theme-text-secondary">
                      {plan.marketingSubtitle || plan.description || "Geração de questões com IA para rotina de estudos."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-7">
                    <p className="flex items-end gap-2">
                      <span className="h1">{priceFormatted}</span>
                      <span className="pb-1 body2 text-theme-text-secondary">/ mês</span>
                    </p>
                    <div className="flex flex-col gap-3">
                      {plan.features.map((feature) => (
                        <Feature key={feature}>{feature}</Feature>
                      ))}
                    </div>
                    {relation === "current" ? (
                      <Button variant="outline" className="w-full" disabled>
                        <i className="ti ti-rosette-discount-check text-base leading-none" />
                        Plano atual
                      </Button>
                    ) : relation === "downgrade" ? (
                      <div className="space-y-1.5">
                        <Button variant="outline" className="w-full" disabled>
                          Inferior ao plano atual
                        </Button>
                        <p className="text-center caption2 text-theme-text-secondary">
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
                </div>
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
      <i className="ti ti-check mt-0.5 text-base leading-none shrink-0 text-primary-500" />
      <span className="body2 text-theme-text-primary">{children}</span>
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
