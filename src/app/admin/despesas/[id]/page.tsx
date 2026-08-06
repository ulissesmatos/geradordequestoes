import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { deleteExpenseAction, updateExpenseAction } from "@/app/admin/admin-actions";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [expense, campaigns] = await Promise.all([
    prisma.expense.findUnique({ where: { id } }),
    prisma.marketingCampaign.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } })
  ]);
  if (!expense) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/despesas" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para despesas
      </Link>

      <AdminPageHeader title="Editar despesa" description={expense.description} />

      <Card>
        <CardContent className="pt-6">
          <form key={expense.updatedAt.getTime()} action={updateExpenseAction} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="expenseId" value={expense.id} />
            <Input name="description" defaultValue={expense.description} required className="md:col-span-2" />
            <Select name="category" defaultValue={expense.category} required>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={(expense.amountCents / 100).toFixed(2)} required />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Competência</span>
              <Input name="competenceDate" type="date" required defaultValue={toDateInputValue(expense.competenceDate)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Paga em (opcional)</span>
              <Input name="paidAt" type="date" defaultValue={toDateInputValue(expense.paidAt)} />
            </label>
            <Input name="vendor" defaultValue={expense.vendor ?? ""} placeholder="Fornecedor" />
            <Select name="campaignId" defaultValue={expense.campaignId ?? ""}>
              <option value="">Sem campanha vinculada</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input name="isRecurring" type="checkbox" defaultChecked={expense.isRecurring} /> Despesa recorrente (fixa mensal)
            </label>
            <div className="md:col-span-3 space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input name="countsAsExpense" type="checkbox" defaultChecked={expense.countsAsExpense} /> Conta como despesa
                operacional (entra no Resultado do mês / DRE)
              </label>
              <p className="text-xs text-[var(--muted-foreground)]">
                Desmarque para distribuição de lucro entre sócios, retirada de sócio, ou qualquer saída que não seja custo do
                negócio: continua contando no Saldo de caixa se marcada como paga, mas some do DRE e da margem.
              </p>
            </div>
            <Textarea name="notes" defaultValue={expense.notes ?? ""} placeholder="Notas" className="md:col-span-3" />
            <div className="flex items-center gap-3 md:col-span-3">
              <SubmitButton>Salvar alterações</SubmitButton>
              <ConfirmDeleteButton action={deleteExpenseAction} id={expense.id} label="Excluir despesa" confirmMessage={`Excluir a despesa "${expense.description}"?`} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
