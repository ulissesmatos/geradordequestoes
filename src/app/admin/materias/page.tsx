import { createSubjectAction, deleteSubjectAction, updateSubjectAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminSubjectsPage() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { topics: true, questions: true } } }
  });
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Matérias" description="Categorias de conteúdo de nível superior." />
      <Card>
        <CardHeader><CardTitle>Nova matéria</CardTitle></CardHeader>
        <CardContent>
          <form action={createSubjectAction} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <Input name="name" placeholder="Nome" required />
            <Textarea name="description" placeholder="Descrição" />
            <SubmitButton>Criar</SubmitButton>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {subjects.map((subject) => (
          <Card key={subject.id}>
            <CardContent className="space-y-3 pt-5">
              <form action={updateSubjectAction} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                <input type="hidden" name="id" value={subject.id} />
                <Input name="name" defaultValue={subject.name} required />
                <Textarea name="description" defaultValue={subject.description ?? ""} placeholder="Descrição" />
                <SubmitButton variant="outline">Salvar</SubmitButton>
              </form>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <p className="text-xs text-[var(--muted-foreground)]">{subject._count.topics} assuntos · {subject._count.questions} questões</p>
                <ConfirmDeleteButton
                  action={deleteSubjectAction}
                  id={subject.id}
                  confirmMessage={`Excluir a matéria "${subject.name}"?`}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
