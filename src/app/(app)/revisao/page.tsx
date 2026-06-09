import { Heart, RotateCcw } from "lucide-react";
import { QuestionSetMode, QuestionStatus } from "@prisma/client";
import { ModeGenerateForm } from "@/components/mode-generate-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function ReviewPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const questionVisibility = {
    OR: [{ status: QuestionStatus.APPROVED }, { createdById: user.id }]
  };
  const [subjects, wrongAttempts, favorites, recent, revisionSets] = await Promise.all([
    prisma.subject.findMany({ include: { topics: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.questionAttempt.findMany({
      where: { userId: user.id, isCorrect: false, question: questionVisibility },
      include: { question: { include: { subject: true, topic: true } } },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.favoriteQuestion.findMany({
      where: { userId: user.id, question: questionVisibility },
      include: { question: { include: { subject: true, topic: true } } },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.questionAttempt.findMany({
      where: { userId: user.id, question: questionVisibility },
      include: { question: { include: { subject: true, topic: true } } },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.questionSet.findMany({
      where: { userId: user.id, mode: QuestionSetMode.REVISAO },
      include: { subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  const context = wrongAttempts
    .slice(0, 8)
    .map((attempt, index) => `${index + 1}. ${attempt.question.subject.name}/${attempt.question.topic.name}: ${attempt.question.statement}`)
    .join("\n");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revisão</h1>
        <p className="text-[var(--muted-foreground)]">Use seus erros e favoritos para gerar novos blocos focados nas suas dificuldades.</p>
      </div>

      <ModeGenerateForm
        subjects={subjects}
        mode="REVISAO"
        title="Gerar revisão com IA"
        description="A IA pode usar seus erros recentes como contexto para criar questões parecidas, mas originais."
        promptPlaceholder="Ex.: gere questões para revisar meus erros recentes com justificativas bem didáticas."
        context={context}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ReviewColumn title="Questões erradas" icon={<RotateCcw className="h-5 w-5" />} items={wrongAttempts.map((attempt) => attempt.question)} />
        <ReviewColumn title="Favoritas" icon={<Heart className="h-5 w-5" />} items={favorites.map((favorite) => favorite.question)} />
        <ReviewColumn title="Recentes" icon={<RotateCcw className="h-5 w-5" />} items={recent.map((attempt) => attempt.question)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Revisões geradas</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {revisionSets.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhuma revisão gerada ainda.</p>}
          {revisionSets.map((set) => (
            <a key={set.id} href={`/questoes/estudar?setId=${set.id}`} className="rounded-md border border-[var(--border)] p-4 hover:border-[var(--primary)]">
              <p className="font-semibold">{set.title}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{set.subject.name} / {set.topic.name}</p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">{set.quantity} questões / {set.format}</p>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewColumn({ title, icon, items }: { title: string; icon: React.ReactNode; items: Array<{ id: string; statement: string; explanation: string; subject: { name: string }; topic: { name: string } }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nada por aqui ainda.</p>}
        {items.map((question) => (
          <div key={question.id} className="rounded-md border border-[var(--border)] p-3">
            <p className="line-clamp-3 text-sm">{question.statement}</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{question.subject.name} / {question.topic.name}</p>
            <p className="mt-2 text-xs">{question.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
