import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, Check, Download, Lock, Send, Trash2, X } from "lucide-react";
import { MockExamStatus } from "@prisma/client";
import {
  archiveMockExamAction,
  closeMockExamAction,
  deleteMockExamAction,
  publishMockExamAction
} from "@/app/admin/simulados/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatExamDuration } from "@/lib/mock-exams";
import { mockExamStatusMeta } from "@/lib/mock-exam-labels";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function AdminMockExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exam = await prisma.mockExam.findUnique({
    where: { id },
    include: {
      teamAccount: { select: { name: true } },
      questionSet: {
        select: {
          quantity: true,
          subject: { select: { name: true } },
          topic: { select: { name: true } },
          questions: {
            select: { id: true, statement: true, answer: true, explanation: true, orderInSet: true },
            orderBy: { orderInSet: "asc" }
          }
        }
      },
      sessions: {
        where: { finishedAt: { not: null } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ netScore: "desc" }, { totalSeconds: "asc" }]
      },
      _count: { select: { sessions: { where: { finishedAt: null } } } }
    }
  });
  if (!exam) notFound();

  const meta = mockExamStatusMeta[exam.status];
  const isDraft = exam.status === MockExamStatus.DRAFT;
  const isPublished = exam.status === MockExamStatus.PUBLISHED;
  const canDelete = isDraft && exam.sessions.length === 0 && exam._count.sessions === 0;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/simulados"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Simulados
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AdminPageHeader
            title={exam.title}
            description={`${exam.questionSet.subject.name} / ${exam.questionSet.topic.name} · ${exam.questionSet.quantity} questões · ${exam.durationMinutes} min · ${exam.teamAccount?.name ?? "Todos os assinantes"}`}
          />
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Janela: {exam.opensAt ? dateFmt.format(exam.opensAt) : "imediata"} →{" "}
            {exam.closesAt ? dateFmt.format(exam.closesAt) : "sem fechamento"}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", meta.className)}>{meta.label}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {isDraft && (
          <form action={publishMockExamAction.bind(null, exam.id)}>
            <SubmitButton>
              <Send className="h-4 w-4" />
              Publicar
            </SubmitButton>
          </form>
        )}
        {isPublished && (
          <form action={closeMockExamAction.bind(null, exam.id)}>
            <SubmitButton variant="outline">
              <Lock className="h-4 w-4" />
              Fechar (finaliza sessões abertas)
            </SubmitButton>
          </form>
        )}
        {exam.status !== MockExamStatus.ARCHIVED && !isDraft && (
          <form action={archiveMockExamAction.bind(null, exam.id)}>
            <SubmitButton variant="outline">
              <Archive className="h-4 w-4" />
              Arquivar
            </SubmitButton>
          </form>
        )}
        {canDelete && (
          <form action={deleteMockExamAction.bind(null, exam.id)}>
            <SubmitButton variant="destructive">
              <Trash2 className="h-4 w-4" />
              Excluir rascunho
            </SubmitButton>
          </form>
        )}
        {exam.sessions.length > 0 && (
          <a
            href={`/admin/simulados/${exam.id}/export`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-subtle)]"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        )}
      </div>

      {/* Resultados nominais (visão do admin/coordenador) */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados ({exam.sessions.length} finalizados{exam._count.sessions ? ` · ${exam._count.sessions} em andamento` : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {exam.sessions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma participação finalizada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-left">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">Nota líquida</th>
                    <th className="px-3 py-2 font-semibold">C / E / B</th>
                    <th className="px-3 py-2 font-semibold">Tempo</th>
                    <th className="px-3 py-2 font-semibold">Finalizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {exam.sessions.map((session, i) => (
                    <tr key={session.id} className="border-b border-[var(--border)] last:border-0 even:bg-[var(--surface-subtle)]">
                      <td className="px-3 py-2 tabular-nums">{i + 1}º</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{session.user.name}</span>{" "}
                        <span className="text-[var(--muted-foreground)]">({session.user.email})</span>
                      </td>
                      <td className="px-3 py-2 font-bold tabular-nums">{session.netScore}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {session.correctCount} / {session.wrongCount} / {session.blankCount}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatExamDuration(session.totalSeconds ?? 0)}</td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {session.finishedAt ? dateFmt.format(session.finishedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview das questões com gabarito (revisão antes de publicar) */}
      <Card>
        <CardHeader>
          <CardTitle>Questões e gabarito{isDraft ? " — revise antes de publicar" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.questionSet.questions.map((question, i) => (
            <div key={question.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Questão {i + 1}</p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    question.answer === "CERTO" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                  )}
                >
                  {question.answer === "CERTO" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  Gabarito: {question.answer === "CERTO" ? "Certo" : "Errado"}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{question.statement}</p>
              {question.explanation && (
                <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--surface-subtle)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">
                  {question.explanation}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
