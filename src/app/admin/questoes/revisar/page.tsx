import { QuestionStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { QuestionReviewForm } from "@/components/admin/question-review-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function ReviewQuestionsPage() {
  // Fila de revisão: processa das mais antigas; o limite evita carregar
  // centenas de formulários de uma vez — revisadas saem da fila e liberam as próximas.
  const questions = await prisma.question.findMany({
    where: { status: { in: [QuestionStatus.DRAFT, QuestionStatus.PENDING_REVIEW] } },
    include: { subject: true, topic: true, createdBy: true, options: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
    take: 50
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Revisar questões" description="Questões em rascunho ou aguardando revisão." />
      {questions.length === 0 && <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Nenhuma questão pendente.</p>}
      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader>
            <CardTitle className="text-base">{question.subject.name} / {question.topic.name} / {question.sourceType} / {question.format}</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">Criada por: {question.createdBy?.email ?? "sem usuário"}</p>
          </CardHeader>
          <CardContent>
            <QuestionReviewForm question={question} defaultStatus={QuestionStatus.APPROVED} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
