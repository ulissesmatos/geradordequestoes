import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { updateQuestionFeedbackStatusAction } from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

const typeLabels: Record<string, string> = {
  GABARITO_ERRADO: "Gabarito errado",
  ENUNCIADO_CONFUSO: "Enunciado confuso",
  DESATUALIZADA: "Desatualizada",
  OUTRO: "Outro"
};

function formatDate(date: Date) {
  return formatDateTimeBR(date);
}

export default async function AdminFeedbacksPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const { page: pageRaw, status } = await searchParams;
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const statusFilter = status === "REVIEWED" || status === "RESOLVED" ? status : status === "all" ? null : "PENDING";

  const where = statusFilter ? { status: statusFilter as never } : {};
  const [feedbacks, total, pendingCount] = await Promise.all([
    prisma.questionFeedback.findMany({
      where,
      include: {
        user: { select: { email: true } },
        question: {
          select: {
            id: true,
            statement: true,
            answer: true,
            status: true,
            subject: { select: { name: true } },
            topic: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.questionFeedback.count({ where }),
    prisma.questionFeedback.count({ where: { status: "PENDING" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filters = [
    { key: "PENDING", label: "Pendentes" },
    { key: "REVIEWED", label: "Revisados" },
    { key: "RESOLVED", label: "Resolvidos" },
    { key: "all", label: "Todos" }
  ];
  const activeFilter = statusFilter ?? "all";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Feedback de questões" description={`${pendingCount} pendentes · reportes dos alunos sobre as questões`} />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`/admin/feedbacks?status=${f.key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${activeFilter === f.key ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border border-[var(--border)] hover:bg-[var(--surface-subtle)]"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {feedbacks.map((fb) => {
          const isGabarito = fb.type === "GABARITO_ERRADO";
          return (
            <Card key={fb.id} className={isGabarito && fb.status === "PENDING" ? "border-[var(--destructive)]" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={isGabarito ? "danger" : "neutral"}>
                      {isGabarito && <AlertTriangle className="h-3 w-3" />}
                      {typeLabels[fb.type] ?? fb.type}
                    </StatusBadge>
                    <StatusBadge tone={statusTone(fb.status)}>{fb.status}</StatusBadge>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {fb.question.subject.name} / {fb.question.topic.name}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatDate(fb.createdAt)}</span>
                </div>

                <p className="text-sm">{fb.question.statement}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Gabarito atual: <strong>{fb.question.answer ?? "alternativas"}</strong> · status da questão: {fb.question.status} · reportado por {fb.user.email}
                </p>
                {fb.message && (
                  <p className="whitespace-pre-wrap rounded-md bg-[var(--surface-subtle)] p-3 text-sm">{fb.message}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/admin/questoes/revisar"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-subtle)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Revisar questões
                  </Link>
                  {fb.status !== "REVIEWED" && (
                    <form action={updateQuestionFeedbackStatusAction}>
                      <input type="hidden" name="id" value={fb.id} />
                      <input type="hidden" name="status" value="REVIEWED" />
                      <SubmitButton variant="outline" size="sm">Marcar revisado</SubmitButton>
                    </form>
                  )}
                  {fb.status !== "RESOLVED" && (
                    <form action={updateQuestionFeedbackStatusAction}>
                      <input type="hidden" name="id" value={fb.id} />
                      <input type="hidden" name="status" value="RESOLVED" />
                      <SubmitButton size="sm">Marcar resolvido</SubmitButton>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {feedbacks.length === 0 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum feedback nesta visão.
          </p>
        )}
      </div>

      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/feedbacks?status=${activeFilter}&page=${p}`} />
    </div>
  );
}
