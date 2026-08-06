import Link from "next/link";
import { ExpenseCategory } from "@prisma/client";
import { Download } from "lucide-react";
import { createExpenseAction, deleteExpenseAction } from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { CategoryBarChart, CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getExpensesByCategory, getExpenseTotal, getExpenseTrend } from "@/lib/analytics/expenses";
import { formatDateBR, formatMonthKeyBR } from "@/lib/dates";
import { EXPENSE_CATEGORY_LABELS, expenseCategoryLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function AdminExpensesPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; category?: string; campaignId?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const category = Object.values(ExpenseCategory).includes(params.category as ExpenseCategory)
    ? (params.category as ExpenseCategory)
    : undefined;
  const campaignId = params.campaignId?.trim() || undefined;

  const where = { ...(category ? { category } : {}), ...(campaignId ? { campaignId } : {}) };

  const [expenses, total, totalAllTime, byCategory, trend, campaigns, filteredCampaign] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { campaign: { select: { name: true } } },
      orderBy: { competenceDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.expense.count({ where }),
    getExpenseTotal(),
    getExpensesByCategory(),
    getExpenseTrend(12),
    prisma.marketingCampaign.findMany({ where: { isActive: true }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    campaignId ? prisma.marketingCampaign.findUnique({ where: { id: campaignId }, select: { name: true } }) : Promise.resolve(null)
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const byCategoryData = byCategory.map((row) => ({ categoria: expenseCategoryLabel(row.category), valor: row.amountCents / 100 }));
  const trendData = trend.map((row) => ({ month: formatMonthKeyBR(row.month), despesas: row.amountCents / 100 }));

  const buildHref = (p: number) =>
    `/admin/despesas?${new URLSearchParams({ ...(category ? { category } : {}), ...(campaignId ? { campaignId } : {}), page: String(p) }).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Despesas"
        description="Livro-caixa de saída: hospedagem, ferramentas, folha, taxas de gateway, impostos e marketing. Custo de IA e comissão de afiliado já são automáticos e não entram aqui."
        actions={
          <Link
            href={`/admin/despesas/export${campaignId ? `?campaignId=${campaignId}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--surface-subtle)]"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Link>
        }
      />

      {filteredCampaign && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Filtrando por campanha: <strong>{filteredCampaign.name}</strong> ·{" "}
          <Link href="/admin/despesas" className="underline">
            limpar filtro
          </Link>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{formatMoney(totalAllTime)}</CardTitle>
            <CardDescription>Total de despesas lançadas (todo o período)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{total}</CardTitle>
            <CardDescription>Lançamentos {category ? `— ${expenseCategoryLabel(category)}` : campaignId ? "— desta campanha" : ""}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategoryData.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhuma despesa lançada ainda.</p>
            ) : (
              <CategoryBarChart data={byCategoryData} xKey="categoria" colorByCategory series={[{ key: "valor", label: "Despesas (R$)", color: CHART_COLORS.rose }]} valueFormat="brl" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tendência mensal — últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart data={trendData} xKey="month" series={[{ key: "despesas", label: "Despesas (R$)", color: CHART_COLORS.rose }]} valueFormat="brl" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova despesa</CardTitle>
          <CardDescription>Data de competência é o mês/período contábil da despesa — usada no Caixa & DRE e nos gráficos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createExpenseAction} className="grid gap-3 md:grid-cols-3">
            <Input name="description" placeholder="Descrição (ex.: Hospedagem Vercel — agosto)" required className="md:col-span-2" />
            <Select name="category" required defaultValue="">
              <option value="" disabled>
                Categoria
              </option>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Valor (R$)" required />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Competência</span>
              <Input name="competenceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Paga em (opcional)</span>
              <Input name="paidAt" type="date" />
            </label>
            <Input name="vendor" placeholder="Fornecedor (opcional)" />
            <Select name="campaignId" defaultValue={campaignId ?? ""}>
              <option value="">Sem campanha vinculada</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input name="isRecurring" type="checkbox" /> Despesa recorrente (fixa mensal)
            </label>
            <Textarea name="notes" placeholder="Notas (opcional)" className="md:col-span-3" />
            <div className="md:col-span-3">
              <SubmitButton>Lançar despesa</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
          <CardDescription className="space-x-2">
            <span>
              {total} registros · página {page} de {totalPages}
            </span>
            <FilterLinks activeCategory={category} campaignId={campaignId} />
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Descrição</th>
                <th>Categoria</th>
                <th>Valor</th>
                <th>Competência</th>
                <th>Paga em</th>
                <th>Campanha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{expense.description}</td>
                  <td>{expenseCategoryLabel(expense.category)}</td>
                  <td className="font-semibold">{formatMoney(expense.amountCents)}</td>
                  <td>{formatDateBR(expense.competenceDate)}</td>
                  <td className="text-[var(--muted-foreground)]">{expense.paidAt ? formatDateBR(expense.paidAt) : "A pagar"}</td>
                  <td className="text-[var(--muted-foreground)]">{expense.campaign?.name ?? "—"}</td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/admin/despesas/${expense.id}`}
                        className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-subtle)]"
                      >
                        Editar
                      </Link>
                      <ConfirmDeleteButton action={deleteExpenseAction} id={expense.id} confirmMessage={`Excluir a despesa "${expense.description}"?`} />
                    </span>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-[var(--muted-foreground)]">
                    Nenhuma despesa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}

function FilterLinks({ activeCategory, campaignId }: { activeCategory?: ExpenseCategory; campaignId?: string }) {
  const qs = campaignId ? `&campaignId=${campaignId}` : "";
  return (
    <span className="inline-flex flex-wrap gap-1.5 align-middle">
      <Link href={`/admin/despesas?${campaignId ? `campaignId=${campaignId}` : ""}`} className={!activeCategory ? "font-semibold underline" : "underline"}>
        Todas
      </Link>
      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
        <Link
          key={value}
          href={`/admin/despesas?category=${value}${qs}`}
          className={activeCategory === value ? "font-semibold underline" : "underline"}
        >
          {label}
        </Link>
      ))}
    </span>
  );
}
