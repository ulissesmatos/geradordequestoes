import { createQuestionAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminQuestionsPage() {
  const [subjects, questions] = await Promise.all([
    prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } }),
    prisma.question.findMany({
      include: {
        subject: true,
        topic: true,
        createdBy: true,
        questionSet: true,
        options: { orderBy: { order: "asc" } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  const topics = subjects.flatMap((subject) => subject.topics.map((topic) => ({ ...topic, subjectName: subject.name })));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Questões</h1>
      <Card>
        <CardHeader><CardTitle>Nova questão manual Certo/Errado</CardTitle></CardHeader>
        <CardContent>
          <form action={createQuestionAction} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Select name="subjectId" required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
              <Select name="topicId" required>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.subjectName} / {topic.name}</option>)}</Select>
              <Select name="difficulty" defaultValue="MEDIO"><option value="FACIL">Fácil</option><option value="MEDIO">Médio</option><option value="DIFICIL">Difícil</option></Select>
              <Select name="status" defaultValue="PENDING_REVIEW"><option value="DRAFT">Rascunho</option><option value="PENDING_REVIEW">Pendente</option><option value="APPROVED">Aprovada</option><option value="REJECTED">Rejeitada</option></Select>
            </div>
            <Textarea name="statement" placeholder="Enunciado" required />
            <Select name="answer" defaultValue="CERTO"><option value="CERTO">CERTO</option><option value="ERRADO">ERRADO</option></Select>
            <Textarea name="explanation" placeholder="Justificativa" required />
            <SubmitButton>Criar questão</SubmitButton>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {questions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {question.subject.name} / {question.topic.name} / {question.status} / {question.format}
              </CardTitle>
              <p className="text-xs text-[var(--muted-foreground)]">
                Criada por: {question.createdBy?.email ?? "manual/sem usuário"} {question.questionSet ? `/ Bloco: ${question.questionSet.title}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>{question.statement}</p>
              {question.options.length > 0 ? (
                <div className="grid gap-2">
                  {question.options.map((option) => (
                    <p key={option.id} className={option.isCorrect ? "text-sm font-semibold text-green-700" : "text-sm"}>
                      {option.label}) {option.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold">Gabarito: {question.answer}</p>
              )}
              <p className="text-sm text-[var(--muted-foreground)]">{question.explanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
