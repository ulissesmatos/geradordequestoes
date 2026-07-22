import Link from "next/link";
import { ArrowLeft, CalendarClock, CheckCircle2, Play } from "lucide-react";
import { QuestionRunner } from "@/components/question-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  ensureReviewBackfill,
  getDueReviewQuestions,
  getDueReviewSummary,
  REVIEW_SESSION_LIMIT
} from "@/lib/review";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function ReviewPage({
  searchParams
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { start } = await searchParams;

  // Usuários com histórico anterior à feature ganham a agenda na primeira visita.
  await ensureReviewBackfill(user.id);

  // ── Sessão de revisão ──
  if (start === "1") {
    const questions = await getDueReviewQuestions(user.id);
    if (questions.length === 0) {
      return (
        <div className="space-y-4">
          <BackToSummary />
          <NothingDueCard />
        </div>
      );
    }
    const favoriteIds = await prisma.favoriteQuestion.findMany({
      where: { userId: user.id, questionId: { in: questions.map((q) => q.id) } },
      select: { questionId: true }
    });
    const favSet = new Set(favoriteIds.map((f) => f.questionId));

    return (
      <div className="space-y-4">
        <BackToSummary />
        <QuestionRunner
          questions={questions.map((q) => ({ ...q, isFavorited: favSet.has(q.id) }))}
          mode="study"
        />
      </div>
    );
  }

  // ── Resumo do dia ──
  const summary = await getDueReviewSummary(user.id);
  const nextDue =
    summary.total === 0
      ? await prisma.questionReviewState.findFirst({
          where: { userId: user.id, dueAt: { gt: new Date() } },
          orderBy: { dueAt: "asc" },
          select: { dueAt: true }
        })
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revisão</h1>
        <p className="text-[var(--muted-foreground)]">
          Repetição espaçada: quem você errou volta logo; quem você acertou volta em intervalos crescentes
          (3, 7, 16 e 35 dias).
        </p>
      </div>

      {summary.total === 0 ? (
        <NothingDueCard nextDueAt={nextDue?.dueAt ?? null} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-[var(--primary)]" />
              Revisão de hoje
            </CardTitle>
            <CardDescription>
              Você tem <strong>{summary.total}</strong> {summary.total === 1 ? "questão vencida" : "questões vencidas"} para
              revisar{summary.total > REVIEW_SESSION_LIMIT ? ` — a sessão traz as ${REVIEW_SESSION_LIMIT} mais atrasadas` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {summary.bySubject.map((subject) => (
                <span
                  key={subject.subjectId}
                  className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-soft-foreground)]"
                >
                  {subject.subjectName}: {subject.count}
                </span>
              ))}
            </div>
            <Button asChild>
              <Link href="/revisao?start=1">
                <Play className="h-4 w-4" />
                Iniciar revisão
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackToSummary() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/revisao">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>
    </Button>
  );
}

function NothingDueCard({ nextDueAt }: { nextDueAt?: Date | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-semibold">Nada para revisar hoje!</p>
        <p className="max-w-md text-sm text-[var(--muted-foreground)]">
          {nextDueAt
            ? `Sua próxima revisão está agendada para ${formatDate(nextDueAt)}. Continue respondendo questões para manter a agenda cheia.`
            : "Responda questões nos seus blocos e simulados — as que você errar (e as que acertar, em intervalos maiores) entram automaticamente na fila de revisão."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/biblioteca">Ir para a biblioteca</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}
