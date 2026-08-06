import { ExpenseCategory } from "@prisma/client";
import { expenseCategoryLabel } from "@/lib/labels";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(request: Request) {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get("category");
  const campaignId = searchParams.get("campaignId");
  const category = Object.values(ExpenseCategory).includes(categoryParam as ExpenseCategory) ? (categoryParam as ExpenseCategory) : undefined;

  const expenses = await prisma.expense.findMany({
    where: { ...(category ? { category } : {}), ...(campaignId ? { campaignId } : {}) },
    include: { campaign: { select: { name: true } } },
    orderBy: { competenceDate: "desc" }
  });

  const header = ["descricao", "categoria", "valor_brl", "competencia", "paga_em", "recorrente", "fornecedor", "campanha", "notas"];
  const rows = expenses.map((expense) =>
    [
      csvCell(expense.description),
      csvCell(expenseCategoryLabel(expense.category)),
      (expense.amountCents / 100).toFixed(2),
      expense.competenceDate.toISOString().slice(0, 10),
      expense.paidAt?.toISOString().slice(0, 10) ?? "",
      expense.isRecurring ? "sim" : "não",
      csvCell(expense.vendor),
      csvCell(expense.campaign?.name),
      csvCell(expense.notes)
    ].join(";")
  );

  // BOM para o Excel abrir acentos corretamente.
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="despesas.csv"`
    }
  });
}
