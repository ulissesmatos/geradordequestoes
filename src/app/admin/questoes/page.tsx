import { deleteQuestionAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { ManualQuestionForm } from "@/components/admin/manual-question-form";
import { MathText } from "@/components/math-text";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export default async function AdminQuestionsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const query = (filters.q ?? "").trim();
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const where = query ? { statement: { contains: query, mode: "insensitive" as const } } : {};

  const [subjects, questions, total] = await Promise.all([
    prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } }),
    prisma.question.findMany({
      where,
      include: {
        subject: true,
        topic: true,
        createdBy: true,
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Questões" description="Crie questões manuais e gerencie o banco de questões." />
      <Card>
        <CardHeader><CardTitle>Nova questão manual Certo/Errado</CardTitle></CardHeader>
        <CardContent>
          <ManualQuestionForm
            subjects={subjects.map((s) => ({ id: s.id, name: s.name, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) }))}
          />
        </CardContent>
      </Card>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por enunciado..." className="max-w-sm" />
        <SubmitButton variant="outline">Buscar</SubmitButton>
        <span className="text-sm text-[var(--muted-foreground)]">{total} questões · página {page} de {totalPages}</span>
      </form>

      <div className="space-y-3">
        {questions.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhuma questão encontrada.</p>}
        {questions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base">
                  {question.subject.name} / {question.topic.name} / {question.status} / {question.format}
                </CardTitle>
                <ConfirmDeleteButton action={deleteQuestionAction} id={question.id} confirmMessage="Excluir esta questão?" />
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Criada por: {question.createdBy?.email ?? "manual/sem usuário"} {question.questionSet ? `/ Bloco: ${question.questionSet.title}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p><MathText text={question.statement} /></p>
              {question.options.length > 0 ? (
                <div className="grid gap-2">
                  {question.options.map((option) => (
                    <p key={option.id} className={option.isCorrect ? "text-sm font-semibold text-[var(--success)]" : "text-sm"}>
                      {option.label}) <MathText text={option.text} />
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold">Gabarito: {question.answer}</p>
              )}
              <p className="text-sm text-[var(--muted-foreground)]"><MathText text={question.explanation} /></p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <a
          aria-disabled={page <= 1}
          href={`/admin/questoes?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page - 1) }).toString()}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Anterior
        </a>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/questoes?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page + 1) }).toString()}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Próxima
        </a>
      </div>
    </div>
  );
}
