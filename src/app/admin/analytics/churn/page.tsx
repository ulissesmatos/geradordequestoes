import { AdminPageHeader } from "@/components/admin/page-header";
import { CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCancelReasonBreakdown, getChurnTrend, getRecentCancellations } from "@/lib/analytics/churn";
import { formatDateBR, formatMonthKeyBR } from "@/lib/dates";

const REASON_LABELS: Record<string, string> = {
  VOLUNTARY: "Voluntário",
  PAYMENT_FAILED: "Inadimplência",
  ADMIN: "Encerrado pelo admin",
  TEAM: "Pacote de equipe cancelado",
  UNCLASSIFIED: "Não classificado (anterior a esta métrica)"
};

export default async function ChurnAnalyticsPage() {
  const [trend, breakdown, recent] = await Promise.all([getChurnTrend(12), getCancelReasonBreakdown(), getRecentCancellations(20)]);

  const trendData = trend.map((row) => ({ month: formatMonthKeyBR(row.month), voluntario: row.voluntary, inadimplencia: row.paymentFailed }));
  const voluntaryTotal = breakdown.VOLUNTARY ?? 0;
  const paymentFailedTotal = breakdown.PAYMENT_FAILED ?? 0;
  const otherTotal = (breakdown.ADMIN ?? 0) + (breakdown.TEAM ?? 0) + (breakdown.UNCLASSIFIED ?? 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Churn & Inadimplência"
        description="Cancelamento voluntário vs perda por falta de pagamento — só existe dado classificado a partir desta métrica ter sido criada."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile value={String(voluntaryTotal)} label="Cancelamentos voluntários" hint="Total classificado" />
        <StatTile value={String(paymentFailedTotal)} label="Perdidos por inadimplência" hint="Total classificado" />
        <StatTile value={String(otherTotal)} label="Outros encerramentos" hint="Admin, equipe ou não classificado" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Voluntário vs Inadimplência — últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart
            data={trendData}
            xKey="month"
            series={[
              { key: "voluntario", label: "Voluntário", color: CHART_COLORS.teal },
              { key: "inadimplencia", label: "Inadimplência", color: CHART_COLORS.rose }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cancelamentos recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum cancelamento registrado ainda.</p>}
          {recent.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              <span>
                {row.userEmail} · {row.planName}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {REASON_LABELS[row.cancelReason ?? "UNCLASSIFIED"]} · {formatDateBR(row.endsAt)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
