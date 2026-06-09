import Link from "next/link";
import { BookOpen, CheckCircle2, Clock, Heart, Play } from "lucide-react";
import { QuestionSetMode } from "@prisma/client";
import { QuestionRunner } from "@/components/question-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function StudyPage({
  searchParams
}: {
  searchParams: Promise<{ setId?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const filters = await searchParams;

  const [questionSets, favorites] = await Promise.all([
    prisma.questionSet.findMany({
      where: { userId: user.id },
      include: {
        subject: true,
        topic: true,
        questions: {
          include: {
            attempts: { where: { userId: user.id } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.favoriteQuestion.findMany({
      where: { userId: user.id },
      include: { question: { include: { subject: true, topic: true } } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  const selectedSet = filters.setId
    ? await prisma.questionSet.findFirst({
        where: { id: filters.setId, userId: user.id },
        include: {
          questions: {
            include: {
              subject: true,
              topic: true,
              options: { orderBy: { order: "asc" } }
            },
            orderBy: { orderInSet: "asc" }
          }
        }
      })
    : null;

  const inProgress = questionSets.filter((set) => {
    const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId)));
    return answered.size > 0 && answered.size < set.questions.length;
  });
  const completed = questionSets.filter((set) => {
    const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId)));
    return set.questions.length > 0 && answered.size >= set.questions.length;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Estudar</h1>
          <p className="text-[var(--muted-foreground)]">Acesse seus blocos gerados por IA sempre que quiser.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard">
            <Play className="h-4 w-4" />
            Gerar novo bloco
          </Link>
        </Button>
      </div>

      {selectedSet && (
        <div className="space-y-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/questoes/estudar">Voltar para biblioteca</Link>
          </Button>
          <QuestionRunner questions={selectedSet.questions} mode={selectedSet.mode === QuestionSetMode.SIMULADO ? "simulado" : "study"} />
        </div>
      )}

      {!selectedSet && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <section className="space-y-4">
            <LibrarySection title="Meus blocos IA" icon={<BookOpen className="h-5 w-5" />} sets={questionSets} />
            <LibrarySection title="Em andamento" icon={<Clock className="h-5 w-5" />} sets={inProgress} />
            <LibrarySection title="Respondidos" icon={<CheckCircle2 className="h-5 w-5" />} sets={completed} />
          </section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Favoritos
              </CardTitle>
              <CardDescription>Questões marcadas para revisão rápida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {favorites.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhuma favorita ainda.</p>}
              {favorites.map((favorite) => (
                <div key={favorite.id} className="rounded-md border border-[var(--border)] p-3">
                  <p className="line-clamp-3 text-sm">{favorite.question.statement}</p>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {favorite.question.subject.name} / {favorite.question.topic.name}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function LibrarySection({
  title,
  icon,
  sets
}: {
  title: string;
  icon: React.ReactNode;
  sets: Array<{
    id: string;
    title: string;
    mode: string;
    format: string;
    quantity: number;
    questions: Array<{ id: string; attempts: Array<{ questionId: string }> }>;
    subject: { name: string };
    topic: { name: string };
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {sets.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum bloco por aqui.</p>}
        {sets.map((set) => {
          const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId))).size;
          return (
            <Link key={set.id} href={`/questoes/estudar?setId=${set.id}`} className="rounded-md border border-[var(--border)] p-4 hover:border-[var(--primary)]">
              <p className="font-semibold">{set.title}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{set.subject.name} / {set.topic.name}</p>
              <p className="mt-3 text-sm">{answered} de {set.quantity} respondidas</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{set.mode} / {set.format}</p>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
