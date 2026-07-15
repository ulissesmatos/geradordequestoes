import Link from "next/link";
import { Plus, Timer } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { mockExamStatusMeta } from "@/lib/mock-exam-labels";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function AdminMockExamsPage() {
  const exams = await prisma.mockExam.findMany({
    include: {
      teamAccount: { select: { name: true } },
      questionSet: { select: { quantity: true } },
      _count: { select: { sessions: { where: { finishedAt: { not: null } } } } }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Simulados" description="Simulados oficiais cronometrados (nota líquida Cebraspe)." />
        <Button asChild>
          <Link href="/admin/simulados/novo">
            <Plus className="h-4 w-4" />
            Novo simulado
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-left">
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Público</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Janela</th>
              <th className="px-4 py-3 font-semibold">Questões</th>
              <th className="px-4 py-3 font-semibold">Finalizados</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                  Nenhum simulado ainda. Crie o primeiro!
                </td>
              </tr>
            )}
            {exams.map((exam) => {
              const meta = mockExamStatusMeta[exam.status];
              return (
                <tr key={exam.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-subtle)]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/simulados/${exam.id}`} className="flex items-center gap-2 font-semibold text-[var(--primary)] hover:underline">
                      <Timer className="h-4 w-4 shrink-0" />
                      {exam.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{exam.teamAccount?.name ?? "Todos"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.className)}>{meta.label}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {exam.opensAt ? dateFmt.format(exam.opensAt) : "—"} → {exam.closesAt ? dateFmt.format(exam.closesAt) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{exam.questionSet.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{exam._count.sessions}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
