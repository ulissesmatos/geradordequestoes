import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Clock, Minus, RotateCcw, TrendingUp, Trophy, Users, X } from "lucide-react";
import { MockExamStatus } from "@prisma/client";
import { startMockExamAction } from "@/app/(app)/simulados/actions";
import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { formatExamDuration, getExamWindowState, getMockExamComparatives } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

export default async function MockExamResultPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { id } = await params;
  const { session: sessionIdParam } = await searchParams;

  // Sem unique(mockExamId, userId): pode haver várias sessões (1ª oficial + práticas
  // seguintes) — ver MockExamSession.isPractice no schema. `?session=` escolhe uma específica
  // (ex.: link "Ver resultado oficial" na capa); sem parâmetro, mostra a mais recente concluída
  // — é a que finishMockExamAction acabou de finalizar.
  const session = await prisma.mockExamSession.findFirst({
    where: {
      mockExamId: id,
      userId: user.id,
      finishedAt: { not: null },
      ...(sessionIdParam ? { id: sessionIdParam } : {})
    },
    orderBy: { finishedAt: "desc" },
    include: {
      mockExam: {
        select: {
          title: true,
          status: true,
          opensAt: true,
          closesAt: true,
          questionSet: {
            select: {
              quantity: true,
              questions: {
                select: {
                  id: true,
                  statement: true,
                  answer: true,
                  explanation: true,
                  orderInSet: true,
                  subject: { select: { name: true } }
                },
                orderBy: { orderInSet: "asc" }
              }
            }
          }
        }
      },
      answers: { select: { questionId: true, userAnswer: true } }
    }
  });

  // Resultado só existe após finalizar (gabarito gated por finishedAt).
  if (!session) redirect(`/simulados/${id}`);

  const comparatives = session.isPractice ? null : await getMockExamComparatives(id, session);
  const answerByQuestion = new Map(session.answers.map((a) => [a.questionId, a.userAnswer]));
  const questions = session.mockExam.questionSet.questions;
  const total = questions.length || session.mockExam.questionSet.quantity;
  const canPractice =
    session.mockExam.status === MockExamStatus.PUBLISHED && getExamWindowState(session.mockExam) === "aberto";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/simulados"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Simulados
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Trophy className="h-6 w-6 text-[var(--primary)]" />
              Resultado — {session.mockExam.title}
            </CardTitle>
            <Badge variant={session.isPractice ? "secondary" : "outline"}>
              {session.isPractice ? "Modo prática" : "Tentativa oficial"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {canPractice && (
            <form action={startMockExamAction.bind(null, id)}>
              <Button type="submit" variant="outline" size="sm">
                <RotateCcw className="h-4 w-4" />
                Praticar novamente
              </Button>
            </form>
          )}

          <div className="rounded-[var(--radius-lg)] border border-[var(--primary)] bg-[var(--primary-soft)] p-5 text-center">
            <p className="text-sm font-semibold text-[var(--primary)]">Nota líquida (certas − erradas)</p>
            <p className="mt-1 text-5xl font-bold tabular-nums text-[var(--primary)]">
              {session.netScore}
              <span className="text-2xl font-semibold text-[var(--primary)]/70"> / {total}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox icon={Check} label="Certas" value={session.correctCount ?? 0} className="text-emerald-700" />
            <StatBox icon={X} label="Erradas" value={session.wrongCount ?? 0} className="text-red-700" />
            <StatBox icon={Minus} label="Em branco" value={session.blankCount ?? 0} className="text-[var(--muted-foreground)]" />
            <StatBox
              icon={Clock}
              label="Tempo"
              value={formatExamDuration(session.totalSeconds ?? 0)}
              className="text-[var(--foreground)]"
            />
          </div>

          {session.isPractice ? (
            <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-center text-sm text-[var(--muted-foreground)]">
              Comparativo com a turma disponível só na tentativa oficial (a 1ª).
            </p>
          ) : comparatives ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
                  Comparativo
                </p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Você foi melhor que <strong className="text-[var(--foreground)]">{comparatives.percentBeaten}%</strong> dos
                  participantes.
                </p>
              </div>
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Users className="h-4 w-4 text-[var(--primary)]" />
                  Turma
                </p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Média de <strong className="text-[var(--foreground)]">{comparatives.averageNetScore}</strong> pontos entre{" "}
                  {comparatives.participants} participantes.
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-center text-sm text-[var(--muted-foreground)]">
              O comparativo com a turma aparece quando 5 ou mais participantes finalizarem.
            </p>
          )}
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold">Gabarito e explicações</h2>
      <div className="space-y-4">
        {questions.map((question, i) => {
          const userAnswer = answerByQuestion.get(question.id) ?? null;
          const isBlank = userAnswer === null;
          const isCorrect = !isBlank && userAnswer === question.answer;
          return (
            <div
              key={question.id}
              className={cn(
                "rounded-[var(--radius-lg)] border bg-[var(--surface)] p-5",
                isBlank ? "border-[var(--border)]" : isCorrect ? "border-emerald-300" : "border-red-300"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Questão {i + 1}
                  </p>
                  <Badge variant="outline">{question.subject.name}</Badge>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    isBlank
                      ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                      : isCorrect
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700"
                  )}
                >
                  {isBlank ? "Em branco" : isCorrect ? "Acertou (+1)" : "Errou (−1)"}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-7"><MathText text={question.statement} /></p>
              <div className="mt-3 grid gap-1 text-sm">
                <p>
                  <span className="font-semibold">Gabarito:</span>{" "}
                  {question.answer === "CERTO" ? "Certo" : "Errado"}
                  {!isBlank && (
                    <span className="text-[var(--muted-foreground)]">
                      {" "}· sua resposta: {userAnswer === "CERTO" ? "Certo" : "Errado"}
                    </span>
                  )}
                </p>
                {question.explanation && (
                  <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-subtle)] p-3 leading-6 text-[var(--muted-foreground)]">
                    <MathText text={question.explanation} />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: typeof Check;
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
      <p className="flex items-center justify-center gap-1 text-xs font-medium text-[var(--muted-foreground)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", className)}>{value}</p>
    </div>
  );
}
