import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CategoryBarChart, CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getExpensesByCategory } from "@/lib/analytics/expenses";
import { getCashFlowTrend, getFinancialKpis, getFinancialSummary } from "@/lib/analytics/financials";
import { startOfMonthInBrazil } from "@/lib/dates";
import { expenseCategoryLabel } from "@/lib/labels";

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value * 100) + "%";
}

export default async function CashflowAnalyticsPage() {
  const monthStart = startOfMonthInBrazil();
  const now = new Date();
  const [summary, kpis, cashFlow, expensesByCategory] = await Promise.all([
    getFinancialSummary({ from: monthStart, to: now }),
    getFinancialKpis(),
    getCashFlowTrend(12),
    getExpensesByCategory({ from: monthStart, to: now })
  ]);

  const cashFlowData = cashFlow.map((row) => ({
    month: row.month,
    receita: row.revenueCents / 100,
    despesas: row.expenseCents / 100,
    resultado: row.netCents / 100
  }));
  const expensesByCategoryData = expensesByCategory.map((row) => ({ categoria: expenseCategoryLabel(row.category), valor: row.amountCents / 100 }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Caixa & DRE"
        description="Receita menos despesa do mês corrente, e os indicadores de SaaS que dependem disso (ARR, ARPU, LTV, CAC). Custo de IA aparece à parte, em USD — o resto do painel é em BRL e não há cotação cadastrada para somar os dois."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={formatBRL(summary.revenueCents)} label="Receita bruta (mês)" />
        <StatTile value={formatBRL(summary.totalExpenseCents)} label="Despesas totais (mês)" hint="Despesas lançadas + comissão de afiliados" />
        <StatTile
          value={formatBRL(summary.netCents)}
          label="Resultado líquido (mês)"
          hint={`Margem: ${formatPercent(summary.marginPercent)}`}
        />
        <StatTile value={formatUsd(summary.aiCostUsd)} label="Custo de IA (mês)" hint="Informativo, em USD — não entra no resultado acima" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={formatBRL(kpis.mrrCents)} label="MRR" />
        <StatTile value={formatBRL(kpis.arrCents)} label="ARR" hint="MRR × 12" />
        <StatTile value={formatBRL(kpis.arpuCents)} label="ARPU" hint={`${kpis.activeSubscribers} assinantes ativos`} />
        <StatTile value={formatPercent(kpis.monthlyChurnRate)} label="Churn mensal" hint="Cancelamentos do mês / assinantes ativos" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={kpis.ltvCents !== null ? formatBRL(kpis.ltvCents) : "—"} label="LTV" hint="ARPU / churn mensal" />
        <StatTile value={kpis.cacCents !== null ? formatBRL(kpis.cacCents) : "—"} label="CAC (mês)" hint="Gasto de marketing / novos assinantes pagantes" />
        <StatTile value={kpis.ltvToCac !== null ? `${kpis.ltvToCac.toFixed(1)}x` : "—"} label="LTV : CAC" hint="Acima de 3x é saudável" />
        <StatTile value={formatPercent(kpis.refundRatePercent / 100)} label="Taxa de reembolso" hint="Histórico total, transações estornadas / aprovadas" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo de caixa — últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLineChart
            data={cashFlowData}
            xKey="month"
            series={[
              { key: "receita", label: "Receita", color: CHART_COLORS.teal },
              { key: "despesas", label: "Despesas", color: CHART_COLORS.rose },
              { key: "resultado", label: "Resultado", color: CHART_COLORS.blue }
            ]}
            valueFormat="brl"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despesas por categoria (mês corrente)</CardTitle>
        </CardHeader>
        <CardContent>
          {expensesByCategoryData.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma despesa lançada neste mês.</p>
          ) : (
            <CategoryBarChart
              data={expensesByCategoryData}
              xKey="categoria"
              colorByCategory
              series={[{ key: "valor", label: "Despesas (R$)", color: CHART_COLORS.rose }]}
              valueFormat="brl"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/despesas">
          <Card className="h-full transition-colors hover:border-[var(--primary)]">
            <CardContent className="p-5">
              <p className="font-semibold">Despesas</p>
              <p className="text-sm text-[var(--muted-foreground)]">Lançar e revisar despesas por categoria.</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/campanhas">
          <Card className="h-full transition-colors hover:border-[var(--primary)]">
            <CardContent className="p-5">
              <p className="font-semibold">Campanhas de marketing</p>
              <p className="text-sm text-[var(--muted-foreground)]">Gasto real por campanha e orçamento.</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/analytics/receita">
          <Card className="h-full transition-colors hover:border-[var(--primary)]">
            <CardContent className="p-5">
              <p className="font-semibold">Receita & MRR</p>
              <p className="text-sm text-[var(--muted-foreground)]">Detalhamento por plano e conversão.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
