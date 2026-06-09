import { createSubjectAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminSubjectsPage() {
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Matérias</h1>
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
          <Card key={subject.id}><CardHeader><CardTitle>{subject.name}</CardTitle><p className="text-sm text-[var(--muted-foreground)]">{subject.description}</p></CardHeader></Card>
        ))}
      </div>
    </div>
  );
}
