import { QuestionStatus } from "@prisma/client";
import { reviewQuestionAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function ReviewQuestionsPage() {
  const questions = await prisma.question.findMany({
    where: { status: { in: [QuestionStatus.DRAFT, QuestionStatus.PENDING_REVIEW] } },
    include: { subject: true, topic: true, createdBy: true, options: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Revisar questões</h1>
      {questions.length === 0 && <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Nenhuma questão pendente.</p>}
      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader>
            <CardTitle className="text-base">{question.subject.name} / {question.topic.name} / {question.sourceType} / {question.format}</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">Criada por: {question.createdBy?.email ?? "sem usuário"}</p>
          </CardHeader>
          <CardContent>
            <form action={reviewQuestionAction} className="grid gap-3">
              <input type="hidden" name="questionId" value={question.id} />
              <Textarea name="statement" defaultValue={question.statement} />
              {question.options.length > 0 && (
                <div className="rounded-md border border-[var(--border)] p-3">
                  {question.options.map((option) => (
                    <p key={option.id} className={option.isCorrect ? "text-sm font-semibold text-[var(--success)]" : "text-sm"}>
                      {option.label}) {option.text}
                    </p>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <Select name="answer" defaultValue={question.answer ?? ""}><option value="">Alternativas</option><option value="CERTO">CERTO</option><option value="ERRADO">ERRADO</option></Select>
                <Select name="difficulty" defaultValue={question.difficulty}><option value="FACIL">Fácil</option><option value="MEDIO">Médio</option><option value="DIFICIL">Difícil</option></Select>
                <Select name="status" defaultValue="APPROVED"><option value="APPROVED">Aprovar</option><option value="REJECTED">Rejeitar</option><option value="PENDING_REVIEW">Manter pendente</option></Select>
              </div>
              <Textarea name="explanation" defaultValue={question.explanation} />
              <SubmitButton>Salvar revisão</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
