import { AdminPageHeader } from "@/components/admin/page-header";
import { CategoryBarChart, CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMrrCents,
  getMrrTrend,
  getNewSubscribersTrend,
  getPlanDistribution,
  getRevenueByPlan,
  getTrialToPayConversion
} from "@/lib/analytics/revenue";
import { formatMonthKeyBR } from "@/lib/dates";

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function RevenueAnalyticsPage() {
  const [mrrCents, mrrTrend, revenueByPlan, planDistribution, newSubscribersTrend, conversion] = await Promise.all([
    getMrrCents(),
    getMrrTrend(12),
    getRevenueByPlan(),
    getPlanDistribution(),
    getNewSubscribersTrend(12),
    getTrialToPayConversion()
  ]);

  const mrrChartData = mrrTrend.map((row) => ({ month: formatMonthKeyBR(row.month), mrr: row.mrrCents / 100 }));
  const revenueByPlanData = revenueByPlan.map((row) => ({ plano: row.planName, receita: row.amountCents / 100 }));
  const planDistributionData = planDistribution.map((row) => ({ plano: row.planName, assinantes: row.count }));
  const newSubsData = newSubscribersTrend.map((row) => ({ month: formatMonthKeyBR(row.month), novos: row.count }));
  const activeSubscribersTotal = planDistribution.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Receita & MRR" description="Receita recorrente mensal, distribuição por plano e crescimento de assinantes." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile value={formatBRL(mrrCents)} label="MRR atual" />
        <StatTile
          value={`${(conversion.rate * 100).toFixed(1)}%`}
          label="Conversão trial → pago"
          hint={`${conversion.payingUsers} de ${conversion.totalUsers} usuários`}
        />
        <StatTile value={String(activeSubscribersTotal)} label="Assinantes ativos" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MRR — últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart
            data={mrrChartData}
            xKey="month"
            series={[{ key: "mrr", label: "MRR (R$)", color: CHART_COLORS.teal }]}
            valueFormat="brl"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receita por plano (histórico)</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByPlanData.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhuma transação aprovada registrada ainda.</p>
            ) : (
              <CategoryBarChart
                data={revenueByPlanData}
                xKey="plano"
                colorByCategory
                series={[{ key: "receita", label: "Receita (R$)", color: CHART_COLORS.teal }]}
                valueFormat="brl"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assinantes por plano (hoje)</CardTitle>
          </CardHeader>
          <CardContent>
            {planDistributionData.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhum assinante ativo no momento.</p>
            ) : (
              <CategoryBarChart
                data={planDistributionData}
                xKey="plano"
                colorByCategory
                series={[{ key: "assinantes", label: "Assinantes", color: CHART_COLORS.teal }]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novos assinantes por mês</CardTitle>
          <p className="text-xs text-[var(--muted-foreground)]">
            Conta a primeira assinatura de cada usuário — upgrade e renovação não somam de novo.
          </p>
        </CardHeader>
        <CardContent>
          <TrendLineChart data={newSubsData} xKey="month" series={[{ key: "novos", label: "Novos assinantes", color: CHART_COLORS.blue }]} />
        </CardContent>
      </Card>
    </div>
  );
}
