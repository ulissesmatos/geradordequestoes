import { BookOpen, FileQuestion } from "lucide-react";
import {
  createSubjectAction,
  deleteSubjectAction,
  deleteTopicAction,
  updateSubjectAction,
  updateTopicAction
} from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { TopicQuickAdd } from "@/components/admin/topic-quick-add";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

export default async function AdminSubjectsPage() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { questions: true } },
      topics: {
        orderBy: { name: "asc" },
        include: { _count: { select: { questions: true } } }
      }
    }
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Matérias e assuntos"
        description="Estruture o conteúdo como nos editais: matérias com seus assuntos do conteúdo programático. Cole vários assuntos de uma vez, separados por vírgula ou linha."
      />

      {/* Nova matéria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova matéria</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSubjectAction} className="flex flex-wrap items-center gap-2">
            <Input name="name" placeholder="Nome da matéria (ex.: Direito Constitucional)" required className="max-w-xs" />
            <Input name="description" placeholder="Descrição (opcional)" className="min-w-[200px] flex-1" />
            <SubmitButton>Criar matéria</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {subjects.map((subject) => (
        <Card key={subject.id}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-[var(--primary)]" />
                {subject.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted-foreground)]">
                  {subject.topics.length === 1 ? "1 assunto" : `${subject.topics.length} assuntos`}
                </span>
                {subject._count.questions > 0 ? (
                  <span
                    title="Matérias com questões não podem ser excluídas"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)]"
                  >
                    <FileQuestion className="h-3 w-3" />
                    {subject._count.questions} questões
                  </span>
                ) : (
                  <ConfirmDeleteButton
                    action={deleteSubjectAction}
                    id={subject.id}
                    confirmMessage={`Excluir a matéria "${subject.name}"? Os assuntos dela também serão excluídos.`}
                  />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Edição da matéria */}
            <form key={subject.updatedAt.getTime()} action={updateSubjectAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={subject.id} />
              <Input name="name" defaultValue={subject.name} className="h-8 max-w-[260px] text-sm" required />
              <Input
                name="description"
                defaultValue={subject.description ?? ""}
                placeholder="Descrição (opcional)"
                className="h-8 min-w-[160px] flex-1 text-sm"
              />
              <SubmitButton variant="ghost" size="sm">Salvar</SubmitButton>
            </form>

            {/* Assuntos da matéria */}
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)]/50 p-3">
              <TopicQuickAdd subjectId={subject.id} />

              {subject.topics.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">Nenhum assunto ainda — adicione acima.</p>
              )}

              <div className="space-y-1.5">
                {subject.topics.map((topic) => (
                  <div
                    key={topic.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"
                  >
                    <form key={topic.updatedAt.getTime()} action={updateTopicAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={topic.id} />
                      <Input name="name" defaultValue={topic.name} className="h-8 max-w-[260px] text-sm" required />
                      <Input
                        name="description"
                        defaultValue={topic.description ?? ""}
                        placeholder="Descrição (opcional)"
                        className="h-8 min-w-[160px] flex-1 text-sm"
                      />
                      <SubmitButton variant="ghost" size="sm">Salvar</SubmitButton>
                    </form>
                    {topic._count.questions > 0 ? (
                      <span
                        title="Assuntos com questões não podem ser excluídos"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]"
                      >
                        <FileQuestion className="h-3 w-3" />
                        {topic._count.questions}
                      </span>
                    ) : (
                      <ConfirmDeleteButton
                        action={deleteTopicAction}
                        id={topic.id}
                        confirmMessage={`Excluir o assunto "${topic.name}"?`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
