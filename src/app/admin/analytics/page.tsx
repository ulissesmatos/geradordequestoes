import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent } from "@/components/ui/card";
import { getAiCostSummary } from "@/lib/analytics/ai-cost";
import { getCancelReasonBreakdown } from "@/lib/analytics/churn";
import { activeSubscriptionWhere, getMrrCents } from "@/lib/analytics/revenue";
import { startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

const SECTIONS = [
  { href: "/admin/analytics/caixa", label: "Caixa & DRE", description: "Receita menos despesa, ARR, ARPU, LTV, CAC e fluxo de caixa dos últimos 12 meses." },
  { href: "/admin/analytics/receita", label: "Receita & MRR", description: "MRR, receita por plano, novos assinantes, conversão trial → pago." },
  { href: "/admin/analytics/churn", label: "Churn & Inadimplência", description: "Cancelamentos voluntários vs perda por falta de pagamento." },
  { href: "/admin/analytics/ia", label: "Custo de IA", description: "Tokens, custo por modelo, tendência mensal de gasto." }
];

export default async function AnalyticsHubPage() {
  const monthStart = startOfMonthInBrazil();
  const [mrrCents, activeSubscribers, aiCost, cancelBreakdown] = await Promise.all([
    getMrrCents(),
    prisma.userSubscription.count({ where: activeSubscriptionWhere() }),
    getAiCostSummary(),
    getCancelReasonBreakdown({ from: monthStart, to: new Date() })
  ]);
  const churnThisMonth = (cancelBreakdown.VOLUNTARY ?? 0) + (cancelBreakdown.PAYMENT_FAILED ?? 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Analytics" description="Métricas de negócio e telemetria — visão geral e detalhamento por área." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={formatBRL(mrrCents)} label="MRR" hint="Receita recorrente mensal" />
        <StatTile value={String(activeSubscribers)} label="Assinantes ativos" />
        <StatTile value={formatUsd(aiCost.monthUsd)} label="Custo de IA (mês)" hint="Só geração de questões" />
        <StatTile value={String(churnThisMonth)} label="Cancelamentos (mês)" hint="Voluntário + inadimplência" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:border-[var(--primary)]">
              <CardContent className="space-y-1.5 p-5">
                <p className="font-semibold">{section.label}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{section.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
