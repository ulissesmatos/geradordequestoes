import Link from "next/link";
import { AlertTriangle, ChevronDown, ExternalLink, Pencil, Plus } from "lucide-react";
import type { Difficulty, Prisma, QuestionFormat, QuestionStatus, SourceType } from "@prisma/client";
import { QuestionSetShareVisibility, QuestionStatus as QuestionStatusEnum, Role } from "@prisma/client";
import {
  adminReactivateQuestionSetShareAction,
  adminRevokeQuestionSetShareAction,
  deleteQuestionAction,
  updateQuestionFeedbackStatusAction
} from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminShareVisibilitySelect } from "@/components/admin/share-visibility-select";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { CopyButton } from "@/components/admin/copy-button";
import { ManualQuestionForm } from "@/components/admin/manual-question-form";
import { QuestionReviewForm } from "@/components/admin/question-review-form";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { MathText } from "@/components/math-text";
import { GenerateForm } from "@/components/generate-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { questionSetShareUrl } from "@/lib/question-set-share";

const PAGE_SIZE = 20;
const FEEDBACK_PAGE_SIZE = 30;
const SHARES_PAGE_SIZE = 30;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_REVIEW: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada"
};
const DIFFICULTY_LABELS: Record<string, string> = { FACIL: "Fácil", MEDIO: "Médio", DIFICIL: "Difícil" };
const DIFFICULTY_TONE: Record<string, "success" | "warning" | "danger"> = { FACIL: "success", MEDIO: "warning", DIFICIL: "danger" };
const FORMAT_LABELS: Record<string, string> = { CERTO_ERRADO: "Certo/Errado", MULTIPLA_ESCOLHA: "Múltipla escolha" };

const feedbackTypeLabels: Record<string, string> = {
  GABARITO_ERRADO: "Gabarito errado",
  ENUNCIADO_CONFUSO: "Enunciado confuso",
  DESATUALIZADA: "Desatualizada",
  OUTRO: "Outro"
};

const shareStatusFilters = [
  { key: "active", label: "Ativos" },
  { key: "revoked", label: "Revogados" },
  { key: "all", label: "Todos" }
] as const;

const TABS: AdminTabDef[] = [
  { value: "todas", label: "Todas" },
  { value: "gerar", label: "Gerar com IA" },
  { value: "revisar", label: "Revisar" },
  { value: "feedback", label: "Feedback" },
  { value: "compartilhamentos", label: "Compartilhamentos" }
];

export default async function AdminQuestionsHubPage({
  searchParams
}: {
  searchParams: Promise<{
    tab?: string;
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
  const params = await searchParams;
  const activeTab =
    params.tab === "gerar" || params.tab === "revisar" || params.tab === "feedback" || params.tab === "compartilhamentos"
      ? params.tab
      : "todas";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Questões" description="Banco de questões, geração por IA, revisão, feedback dos alunos e links de blocos compartilhados." />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/questoes" />

      {activeTab === "todas" && <TodasTab searchParams={params} />}
      {activeTab === "gerar" && <GerarTab />}
      {activeTab === "revisar" && <RevisarTab />}
      {activeTab === "feedback" && <FeedbackTab page={params.page} status={params.status} />}
      {activeTab === "compartilhamentos" && <CompartilhamentosTab q={params.q} status={params.status} page={params.page} />}
    </div>
  );
}

async function TodasTab({
  searchParams
}: {
  searchParams: {
    q?: string;
    page?: string;
    subjectId?: string;
    topicId?: string;
    status?: string;
    difficulty?: string;
    format?: string;
    source?: string;
    reviewed?: string;
  };
}) {
  const filters = searchParams;
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
    tab: "todas",
    ...(query ? { q: query } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(topicId ? { topicId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    ...(formatFilter ? { format: formatFilter } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(reviewedFilter ? { reviewed: reviewedFilter } : {})
  };
  const hasActiveFilters = Object.keys(activeFilterParams).length > 1;
  const buildHref = (p: number) => `/admin/questoes?${new URLSearchParams({ ...activeFilterParams, page: String(p) }).toString()}`;

  return (
    <div className="space-y-6">
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
            <input type="hidden" name="tab" value="todas" />
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
                        {formatDateTimeBR(question.createdAt)}
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

async function GerarTab() {
  const subjects = await prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } });
  return <GenerateForm subjects={subjects} />;
}

async function RevisarTab() {
  // Fila de revisão: processa das mais antigas; o limite evita carregar
  // centenas de formulários de uma vez — revisadas saem da fila e liberam as próximas.
  const questions = await prisma.question.findMany({
    where: { status: { in: [QuestionStatusEnum.DRAFT, QuestionStatusEnum.PENDING_REVIEW] } },
    include: { subject: true, topic: true, createdBy: true, options: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
    take: 50
  });

  return (
    <div className="space-y-6">
      {questions.length === 0 && <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Nenhuma questão pendente.</p>}
      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader>
            <CardTitle className="text-base">{question.subject.name} / {question.topic.name} / {question.sourceType} / {question.format}</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">Criada por: {question.createdBy?.email ?? "sem usuário"}</p>
          </CardHeader>
          <CardContent>
            <QuestionReviewForm question={question} defaultStatus={QuestionStatusEnum.APPROVED} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function FeedbackTab({ page: pageRaw, status }: { page?: string; status?: string }) {
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
            updatedAt: true,
            statement: true,
            supportText: true,
            answer: true,
            difficulty: true,
            status: true,
            explanation: true,
            reviewedById: true,
            subject: { select: { name: true } },
            topic: { select: { name: true } },
            options: { select: { id: true, label: true, text: true, isCorrect: true }, orderBy: { order: "asc" } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * FEEDBACK_PAGE_SIZE,
      take: FEEDBACK_PAGE_SIZE
    }),
    prisma.questionFeedback.count({ where }),
    prisma.questionFeedback.count({ where: { status: "PENDING" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));

  const filters = [
    { key: "PENDING", label: "Pendentes" },
    { key: "REVIEWED", label: "Revisados" },
    { key: "RESOLVED", label: "Resolvidos" },
    { key: "all", label: "Todos" }
  ];
  const activeFilter = statusFilter ?? "all";

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">{pendingCount} pendentes · reportes dos alunos sobre as questões</p>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`/admin/questoes?tab=feedback&status=${f.key}`}
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
                      {feedbackTypeLabels[fb.type] ?? fb.type}
                    </StatusBadge>
                    <StatusBadge tone={statusTone(fb.status)}>{fb.status}</StatusBadge>
                    {fb.question.reviewedById && <StatusBadge tone="success">Questão revisada</StatusBadge>}
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {fb.question.subject.name} / {fb.question.topic.name}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatDateTimeBR(fb.createdAt)}</span>
                </div>

                <p className="text-sm">{fb.question.statement}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Gabarito atual: <strong>{fb.question.answer ?? "alternativas"}</strong> · status da questão: {fb.question.status} · reportado por {fb.user.email}
                </p>
                {fb.message && (
                  <p className="whitespace-pre-wrap rounded-md bg-[var(--surface-subtle)] p-3 text-sm">{fb.message}</p>
                )}

                <details className="group rounded-md border border-[var(--border)]" open={isGabarito && fb.status === "PENDING"}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold [&::-webkit-details-marker]:hidden hover:bg-[var(--surface-subtle)]">
                    <span className="flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar / revisar esta questão
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-[var(--border)] p-3">
                    <QuestionReviewForm question={fb.question} />
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/admin/questoes?tab=revisar"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-subtle)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Fila de revisão
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

      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/questoes?tab=feedback&status=${activeFilter}&page=${p}`} />
    </div>
  );
}

async function CompartilhamentosTab({ q, status, page: pageRaw }: { q?: string; status?: string; page?: string }) {
  const query = (q ?? "").trim();
  const activeStatus = shareStatusFilters.some((f) => f.key === status) ? (status as (typeof shareStatusFilters)[number]["key"]) : "active";
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);

  const statusWhere: Prisma.QuestionSetShareWhereInput =
    activeStatus === "active" ? { revokedAt: null } : activeStatus === "revoked" ? { revokedAt: { not: null } } : {};
  const searchWhere: Prisma.QuestionSetShareWhereInput = query
    ? {
        OR: [
          { questionSet: { title: { contains: query, mode: "insensitive" } } },
          { user: { name: { contains: query, mode: "insensitive" } } },
          { user: { email: { contains: query, mode: "insensitive" } } }
        ]
      }
    : {};
  const where: Prisma.QuestionSetShareWhereInput = { ...statusWhere, ...searchWhere };

  const [shares, total, activeCount] = await Promise.all([
    prisma.questionSetShare.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, role: true } },
        questionSet: {
          select: { title: true, quantity: true, subject: { select: { name: true } }, topic: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SHARES_PAGE_SIZE,
      take: SHARES_PAGE_SIZE
    }),
    prisma.questionSetShare.count({ where }),
    prisma.questionSetShare.count({ where: { revokedAt: null } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / SHARES_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">{activeCount} links de bloco de questões ativos no momento</p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {shareStatusFilters.map((f) => (
            <Link
              key={f.key}
              href={`/admin/questoes?tab=compartilhamentos&status=${f.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                activeStatus === f.key
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="compartilhamentos" />
          <input type="hidden" name="status" value={activeStatus} />
          <Input name="q" defaultValue={query} placeholder="Buscar por bloco, nome ou e-mail..." className="max-w-sm" />
          <SubmitButton variant="outline">Buscar</SubmitButton>
        </form>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-left">
              <th className="px-4 py-3 font-semibold">Bloco</th>
              <th className="px-4 py-3 font-semibold">Criado por</th>
              <th className="px-4 py-3 font-semibold">Visibilidade</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Criado em</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shares.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                  Nenhum link encontrado.
                </td>
              </tr>
            )}
            {shares.map((share) => {
              const revoked = Boolean(share.revokedAt);
              return (
                <tr key={share.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-subtle)]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{share.questionSet.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {share.questionSet.subject.name} · {share.questionSet.topic.name} · {share.questionSet.quantity}{" "}
                      {share.questionSet.quantity === 1 ? "questão" : "questões"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{share.user.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                      {share.user.email}
                      {share.user.role === Role.ADMIN && <StatusBadge tone="info">Admin</StatusBadge>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <AdminShareVisibilitySelect
                      shareId={share.id}
                      initialVisibility={share.visibility ?? QuestionSetShareVisibility.LOGGED_IN}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={revoked ? "danger" : "success"}>{revoked ? "Revogado" : "Ativo"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDateTimeBR(share.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CopyButton value={questionSetShareUrl(share.id)} label="Copiar link" />
                      <a
                        href={questionSetShareUrl(share.id)}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir link público"
                        className="inline-flex items-center rounded-md border border-[var(--border)] p-1.5 transition hover:bg-[var(--surface-subtle)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {revoked ? (
                        <form action={adminReactivateQuestionSetShareAction}>
                          <input type="hidden" name="id" value={share.id} />
                          <SubmitButton variant="outline" size="sm">
                            Reativar
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={adminRevokeQuestionSetShareAction}>
                          <input type="hidden" name="id" value={share.id} />
                          <SubmitButton variant="outline" size="sm">
                            Revogar
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/questoes?tab=compartilhamentos&status=${activeStatus}${query ? `&q=${encodeURIComponent(query)}` : ""}&page=${p}`}
      />
    </div>
  );
}
