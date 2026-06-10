import { createTopicAction, deleteTopicAction, updateTopicAction } from "@/app/admin/admin-actions";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminTopicsPage() {
  const subjects = await prisma.subject.findMany({
    include: { topics: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Assuntos</h1>
      <Card>
        <CardHeader><CardTitle>Novo assunto</CardTitle></CardHeader>
        <CardContent>
          <form action={createTopicAction} className="grid gap-3 md:grid-cols-4">
            <Select name="subjectId" required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
            <Input name="name" placeholder="Nome" required />
            <Textarea name="description" placeholder="Descrição" />
            <SubmitButton>Criar</SubmitButton>
          </form>
        </CardContent>
      </Card>
      {subjects.map((subject) => (
        <Card key={subject.id}>
          <CardHeader><CardTitle>{subject.name}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {subject.topics.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum assunto.</p>}
            {subject.topics.map((topic) => (
              <div key={topic.id} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2">
                <form action={updateTopicAction} className="flex flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={topic.id} />
                  <Input name="name" defaultValue={topic.name} className="max-w-[220px]" required />
                  <Input name="description" defaultValue={topic.description ?? ""} placeholder="Descrição" className="flex-1" />
                  <SubmitButton variant="outline">Salvar</SubmitButton>
                </form>
                <ConfirmDeleteButton action={deleteTopicAction} id={topic.id} confirmMessage={`Excluir o assunto "${topic.name}"?`} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
