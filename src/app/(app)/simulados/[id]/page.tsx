import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, ListChecks, Play, Timer } from "lucide-react";
import { MockExamStatus } from "@prisma/client";
import { startMockExamAction } from "@/app/(app)/simulados/actions";
import { MockExamRunner } from "@/components/mock-exam-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { ensureSessionCurrent, getExamWindowState, getStudentTeamAccountId } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function MockExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { id } = await params;

  const exam = await prisma.mockExam.findUnique({
    where: { id },
    include: {
      questionSet: { select: { quantity: true, subject: { select: { name: true } }, topic: { select: { name: true } } } }
    }
  });
  if (!exam || exam.status === MockExamStatus.DRAFT || exam.status === MockExamStatus.ARCHIVED) {
    return <NotFound />;
  }
  if (exam.teamAccountId) {
    const teamId = await getStudentTeamAccountId(user.id);
    if (teamId !== exam.teamAccountId) return <NotFound />;
  }

  const session = await prisma.mockExamSession.findUnique({
    where: { mockExamId_userId: { mockExamId: exam.id, userId: user.id } },
    select: { id: true, finishedAt: true, expiresAt: true, startedAt: true }
  });

  if (session) {
    const done = await ensureSessionCurrent(session);
    if (done) redirect(`/simulados/${exam.id}/resultado`);

    // Sessão em andamento: carrega questões SEM gabarito/explicação (anti-trapaça)
    // e as respostas já gravadas (retomada pós-F5).
    const [questions, answers] = await Promise.all([
      prisma.question.findMany({
        where: { questionSetId: exam.questionSetId },
        select: { id: true, statement: true, orderInSet: true },
        orderBy: { orderInSet: "asc" }
      }),
      prisma.mockExamAnswer.findMany({
        where: { sessionId: session.id },
        select: { questionId: true, userAnswer: true }
      })
    ]);

    return (
      <MockExamRunner
        sessionId={session.id}
        title={exam.title}
        questions={questions.map((q) => ({ id: q.id, statement: q.statement }))}
        initialAnswers={Object.fromEntries(answers.map((a) => [a.questionId, a.userAnswer]))}
        expiresAtIso={session.expiresAt.toISOString()}
        serverNowIso={new Date().toISOString()}
      />
    );
  }

  // Capa: ainda não iniciou.
  const windowState = getExamWindowState(exam);
  const canStart = exam.status === MockExamStatus.PUBLISHED && windowState === "aberto";
  const clampWarning =
    exam.closesAt && new Date(Date.now() + exam.durationMinutes * 60_000) > exam.closesAt;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        href="/simulados"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Simulados
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Timer className="h-6 w-6 text-[var(--primary)]" />
            {exam.title}
          </CardTitle>
          {exam.description && <p className="text-sm text-[var(--muted-foreground)]">{exam.description}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <p className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--primary)]" />
              {exam.questionSet.quantity} questões Certo/Errado · {exam.questionSet.subject.name} / {exam.questionSet.topic.name}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
              Duração: {exam.durationMinutes} minutos
              {exam.closesAt ? ` · disponível até ${dateFmt.format(exam.closesAt)}` : ""}
            </p>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm">
            <p className="font-semibold">Regras (estilo Cebraspe)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
              <li>Cada acerto vale <strong>+1</strong>; cada erro vale <strong>−1</strong>; em branco não pontua.</li>
              <li>Na dúvida, deixar em branco pode ser a melhor estratégia.</li>
              <li>O cronômetro continua correndo mesmo se você fechar a página — não é possível pausar.</li>
              <li>Você tem apenas <strong>uma tentativa</strong>. O gabarito aparece só ao finalizar.</li>
            </ul>
          </div>

          {clampWarning && canStart && (
            <p className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              O simulado fecha em breve: iniciando agora, seu tempo será menor que a duração total.
            </p>
          )}

          {canStart ? (
            <form action={startMockExamAction.bind(null, exam.id)}>
              <Button type="submit" size="lg" className="w-full">
                <Play className="h-5 w-5" />
                Iniciar simulado
              </Button>
            </form>
          ) : (
            <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-center text-sm text-[var(--muted-foreground)]">
              {windowState === "futuro" && exam.opensAt
                ? `Abre em ${dateFmt.format(exam.opensAt)}.`
                : "Este simulado não está mais disponível."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-4">
      <Button asChild variant="outline" size="sm">
        <Link href="/simulados">Voltar para simulados</Link>
      </Button>
      <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Simulado não encontrado.</p>
    </div>
  );
}
