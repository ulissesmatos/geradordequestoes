import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CategoryBarChart, CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiCostByModel, getAiCostSummary, getAiCostTrend } from "@/lib/analytics/ai-cost";
import { formatMonthKeyBR } from "@/lib/dates";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
}

export default async function AiCostAnalyticsPage() {
  const [summary, trend, byModel] = await Promise.all([getAiCostSummary(), getAiCostTrend(12), getAiCostByModel()]);

  const trendData = trend.map((row) => ({ month: formatMonthKeyBR(row.month), custo: row.costUsd }));

  // A paleta categórica validada só tem 3 cores (ver charts.tsx) — além disso, agrupa em "Outros".
  const topModels = byModel.slice(0, 3);
  const otherCost = byModel.slice(3).reduce((sum, row) => sum + row.costUsd, 0);
  const byModelData = [
    ...topModels.map((row) => ({ modelo: row.model, custo: row.costUsd })),
    ...(otherCost > 0 ? [{ modelo: "Outros", custo: otherCost }] : [])
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Custo de IA"
        description="Tokens e custo real de geração de questões — cobre só esse fluxo por enquanto; chat e material de estudo ainda não medem uso."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          value={formatUsd(summary.monthUsd)}
          label="Custo este mês"
          hint={`${(summary.monthTokens.inputTokens + summary.monthTokens.outputTokens).toLocaleString("pt-BR")} tokens`}
        />
        <StatTile
          value={formatUsd(summary.totalUsd)}
          label="Custo total"
          hint={`${(summary.totalTokens.inputTokens + summary.totalTokens.outputTokens).toLocaleString("pt-BR")} tokens`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custo por mês — últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart
            data={trendData}
            xKey="month"
            series={[{ key: "custo", label: "Custo (US$)", color: CHART_COLORS.gold }]}
            valueFormat="usd"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custo por modelo</CardTitle>
          <p className="text-xs text-[var(--muted-foreground)]">
            Compara o que cada modelo já configurado em <code>/admin/ia</code> custou de verdade — é a pergunta prática
            pra decidir entre modelos mais baratos e mais caros.
          </p>
        </CardHeader>
        <CardContent>
          {byModelData.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhum custo medido ainda. Configure o preço por token em{" "}
              <Link href="/admin/ia" className="underline">
                /admin/ia
              </Link>{" "}
              pra começar a medir.
            </p>
          ) : (
            <CategoryBarChart
              data={byModelData}
              xKey="modelo"
              colorByCategory
              series={[{ key: "custo", label: "Custo (US$)", color: CHART_COLORS.teal }]}
              valueFormat="usd"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
