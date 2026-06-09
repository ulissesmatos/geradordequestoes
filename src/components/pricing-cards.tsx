import Link from "next/link";
import type { ReactNode } from "react";
import { Check, MoveRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  aiGenerationsPerDay: number;
};

export function PricingCards({
  plans,
  compact = false
}: {
  plans: PricingPlan[];
  compact?: boolean;
}) {
  const highlightedIndex = plans.length > 1 ? Math.floor(plans.length / 2) : 0;

  return (
    <section className={cn("w-full", compact ? "py-12" : "py-16 lg:py-24")}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <Badge variant="secondary">Planos</Badge>
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Planos para estudar com IA todos os dias.</h2>
            <p className="mx-auto max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
              Escolha um plano ativo, crie sua conta e libere a geração de questões, simulados e revisões pelo painel.
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
            {plans.map((plan, index) => {
              const highlighted = index === highlightedIndex;
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
                      {plan.description || "Geração de questões com IA para rotina de estudos."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-7">
                      <p className="flex items-end gap-2">
                        <span className="text-4xl font-semibold tracking-tight">{formatMoney(plan.priceCents)}</span>
                        <span className="pb-1 text-sm text-[var(--muted-foreground)]">/ mês</span>
                      </p>
                      <div className="space-y-4 text-sm">
                        <Feature>Até {plan.aiGenerationsPerDay} usos de IA por dia</Feature>
                        <Feature>Chat para gerar questões, simulados e revisões</Feature>
                        <Feature>Histórico salvo com blocos gerados</Feature>
                        <Feature>Revisão com base em erros e favoritos</Feature>
                      </div>
                      <Button asChild variant={highlighted ? "default" : "outline"} className="w-full">
                        <Link href="/register">
                          Criar conta <MoveRight className="h-4 w-4" />
                        </Link>
                      </Button>
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
