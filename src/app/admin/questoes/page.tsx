import type { Difficulty, Prisma, QuestionFormat, QuestionStatus, SourceType } from "@prisma/client";
import { ChevronDown, Plus } from "lucide-react";
import { deleteQuestionAction } from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { ManualQuestionForm } from "@/components/admin/manual-question-form";
import { QuestionReviewForm } from "@/components/admin/question-review-form";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { MathText } from "@/components/math-text";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_REVIEW: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada"
};
const DIFFICULTY_LABELS: Record<string, string> = { FACIL: "Fácil", MEDIO: "Médio", DIFICIL: "Difícil" };
const DIFFICULTY_TONE: Record<string, "success" | "warning" | "danger"> = { FACIL: "success", MEDIO: "warning", DIFICIL: "danger" };
const FORMAT_LABELS: Record<string, string> = { CERTO_ERRADO: "Certo/Errado", MULTIPLA_ESCOLHA: "Múltipla escolha" };

function formatDate(date: Date) {
  return formatDateTimeBR(date);
}

export default async function AdminQuestionsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    subjectId?: string;
    topicId?: string;
    status?: string;
    difficulty?: string;
    format?: string;
    source?: string;
    reviewed?: string;
  }>;
}) {
  const filters = await searchParams;
  const query = (filters.q ?? "").trim();
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const subjectId = (filters.subjectId ?? "").trim();
  const topicId = (filters.topicId ?? "").trim();
  const statusFilter = (filters.status ?? "").trim();
  const difficultyFilter = (filters.difficulty ?? "").trim();
  const formatFilter = (filters.format ?? "").trim();
  const sourceFilter = (filters.source ?? "").trim();
  const reviewedFilter = (filters.reviewed ?? "").trim();

  const where: Prisma.QuestionWhereInput = {
    ...(query ? { statement: { contains: query, mode: "insensitive" as const } } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(topicId ? { topicId } : {}),
    ...(statusFilter ? { status: statusFilter as QuestionStatus } : {}),
    ...(difficultyFilter ? { difficulty: difficultyFilter as Difficulty } : {}),
    ...(formatFilter ? { format: formatFilter as QuestionFormat } : {}),
    ...(sourceFilter ? { sourceType: sourceFilter as SourceType } : {}),
    ...(reviewedFilter === "yes" ? { reviewedById: { not: null } } : {}),
    ...(reviewedFilter === "no" ? { reviewedById: null } : {})
  };

  const [subjects, questions, total] = await Promise.all([
    prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } }),
    prisma.question.findMany({
      where,
      include: {
        subject: true,
        topic: true,
        createdBy: { select: { email: true } },
        reviewedBy: { select: { email: true } },
        questionSet: true,
        options: { orderBy: { order: "asc" } }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.question.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilterParams: Record<string, string> = {
    ...(query ? { q: query } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(topicId ? { topicId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    ...(formatFilter ? { format: formatFilter } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(reviewedFilter ? { reviewed: reviewedFilter } : {})
  };
  const hasActiveFilters = Object.keys(activeFilterParams).length > 0;
  const buildHref = (p: number) => `/admin/questoes?${new URLSearchParams({ ...activeFilterParams, page: String(p) }).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Questões" description="Crie questões manuais e gerencie o banco de questões." />

      <Card className="overflow-hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden hover:bg-[var(--surface-subtle)]">
            <span className="flex items-center gap-2 text-lg font-semibold leading-none">
              <Plus className="h-4 w-4" />
              Nova questão manual Certo/Errado
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
          </summary>
          <CardContent className="border-t border-[var(--border)] pt-5">
            <ManualQuestionForm
              subjects={subjects.map((s) => ({ id: s.id, name: s.name, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) }))}
            />
          </CardContent>
        </details>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <form method="get" className="space-y-3">
            <Input name="q" defaultValue={query} placeholder="Buscar por enunciado..." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Matéria
                <Select name="subjectId" defaultValue={subjectId}>
                  <option value="">Todas</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Assunto
                <Select name="topicId" defaultValue={topicId}>
                  <option value="">Todos</option>
                  {subjects.map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {s.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Status
                <Select name="status" defaultValue={statusFilter}>
                  <option value="">Todos</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Dificuldade
                <Select name="difficulty" defaultValue={difficultyFilter}>
                  <option value="">Todas</option>
                  {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Formato
                <Select name="format" defaultValue={formatFilter}>
                  <option value="">Todos</option>
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Origem
                <Select name="source" defaultValue={sourceFilter}>
                  <option value="">Todas</option>
                  <option value="AI">Gerada por IA</option>
                  <option value="MANUAL">Manual</option>
                </Select>
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
                Revisão
                <Select name="reviewed" defaultValue={reviewedFilter}>
                  <option value="">Todas</option>
                  <option value="yes">Revisada pela equipe</option>
                  <option value="no">Ainda não revisada</option>
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton variant="outline">Filtrar</SubmitButton>
              {hasActiveFilters && (
                <a href="/admin/questoes" className="text-sm text-[var(--muted-foreground)] underline-offset-2 hover:underline">
                  Limpar filtros
                </a>
              )}
              <span className="text-sm text-[var(--muted-foreground)]">
                {total} {total === 1 ? "questão encontrada" : "questões encontradas"} · página {page} de {totalPages}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {questions.length === 0 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhuma questão encontrada com esses filtros.
          </p>
        )}
        {questions.map((question) => {
          const correctOption = question.options.find((option) => option.isCorrect);
          return (
            <Card key={question.id} className="overflow-hidden">
              <details className="group" open={total === 1}>
                <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden hover:bg-[var(--surface-subtle)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={statusTone(question.status)}>{STATUS_LABELS[question.status] ?? question.status}</StatusBadge>
                        <StatusBadge tone={DIFFICULTY_TONE[question.difficulty] ?? "neutral"}>
                          {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
                        </StatusBadge>
                        <StatusBadge tone="neutral">{FORMAT_LABELS[question.format] ?? question.format}</StatusBadge>
                        <StatusBadge tone="info">{question.sourceType === "AI" ? "Gerada por IA" : "Manual"}</StatusBadge>
                        {question.reviewedById && <StatusBadge tone="success">Revisada pela equipe</StatusBadge>}
                        {question.format === "CERTO_ERRADO" && question.answer ? (
                          <StatusBadge tone={question.answer === "CERTO" ? "success" : "danger"}>Gabarito: {question.answer}</StatusBadge>
                        ) : correctOption ? (
                          <StatusBadge tone="success">Gabarito: {correctOption.label}</StatusBadge>
                        ) : null}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {question.subject.name} / {question.topic.name} · {question.createdBy?.email ?? "manual/sem usuário"} ·{" "}
                        {formatDate(question.createdAt)}
                        {question.questionSet ? ` · Bloco: ${question.questionSet.title}` : ""}
                        {question.reviewedBy ? ` · revisada por ${question.reviewedBy.email}` : ""}
                      </p>
                      <p className="line-clamp-2 text-sm text-[var(--foreground)]">
                        <MathText text={question.statement} />
                      </p>
                    </div>
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t border-[var(--border)] p-5">
                  <div className="mb-3 flex justify-end">
                    <ConfirmDeleteButton action={deleteQuestionAction} id={question.id} confirmMessage="Excluir esta questão?" />
                  </div>
                  <QuestionReviewForm question={question} defaultStatus={question.status} />
                </div>
              </details>
            </Card>
          );
        })}
      </div>

      <AdminPagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
