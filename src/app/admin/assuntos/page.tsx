import { createTopicAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminTopicsPage() {
  const subjects = await prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } });
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
          <CardContent className="flex flex-wrap gap-2">{subject.topics.map((topic) => <span key={topic.id} className="rounded-md bg-[var(--muted)] px-3 py-1 text-sm">{topic.name}</span>)}</CardContent>
        </Card>
      ))}
    </div>
  );
}
