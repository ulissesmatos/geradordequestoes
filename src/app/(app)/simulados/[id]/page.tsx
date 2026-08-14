import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, ListChecks, Play, Timer } from "lucide-react";
import { MockExamStatus } from "@prisma/client";
import { startMockExamAction } from "@/app/(app)/simulados/actions";
import { MockExamRunner } from "@/components/mock-exam-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { ensureSessionCurrent, examSubjectLabel, getExamWindowState, getStudentTeamAccountId } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

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

  // Sem unique(mockExamId, userId): pode haver várias sessões (1ª oficial + práticas
  // seguintes) — ver MockExamSession.isPractice no schema.
  const sessions = await prisma.mockExamSession.findMany({
    where: { mockExamId: exam.id, userId: user.id },
    select: { id: true, finishedAt: true, expiresAt: true, startedAt: true, isPractice: true },
    orderBy: { startedAt: "asc" }
  });
  const activeSession = sessions.find((item) => !item.finishedAt);
  const officialSession = sessions.find((item) => !item.isPractice);

  if (activeSession) {
    const done = await ensureSessionCurrent(activeSession);
    if (done) redirect(`/simulados/${exam.id}/resultado`);

    // Sessão em andamento: carrega questões SEM gabarito/explicação (anti-trapaça)
    // e as respostas já gravadas (retomada pós-F5).
    const [questions, answers] = await Promise.all([
      prisma.question.findMany({
        where: { questionSetId: exam.questionSetId },
        select: { id: true, statement: true, orderInSet: true, subject: { select: { name: true } } },
        orderBy: { orderInSet: "asc" }
      }),
      prisma.mockExamAnswer.findMany({
        where: { sessionId: activeSession.id },
        select: { questionId: true, userAnswer: true }
      })
    ]);

    return (
      <MockExamRunner
        sessionId={activeSession.id}
        title={exam.title}
        isPractice={activeSession.isPractice}
        questions={questions.map((q) => ({ id: q.id, statement: q.statement, subjectName: q.subject.name }))}
        initialAnswers={Object.fromEntries(answers.map((a) => [a.questionId, a.userAnswer]))}
        expiresAtIso={activeSession.expiresAt.toISOString()}
        serverNowIso={new Date().toISOString()}
      />
    );
  }

  // Capa: ainda não iniciou, ou já concluiu a(s) tentativa(s) anterior(es).
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
              {exam.questionSet.quantity} questões Certo/Errado · {examSubjectLabel(exam)}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
              Duração: {exam.durationMinutes} minutos
              {exam.closesAt ? ` · disponível até ${formatDateTimeBR(exam.closesAt)}` : ""}
            </p>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm">
            <p className="font-semibold">Regras (estilo Cebraspe)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
              <li>Cada acerto vale <strong>+1</strong>; cada erro vale <strong>−1</strong>; em branco não pontua.</li>
              <li>Na dúvida, deixar em branco pode ser a melhor estratégia.</li>
              <li>O cronômetro continua correndo mesmo se você fechar a página — não é possível pausar.</li>
              {officialSession ? (
                <li>
                  Isso é <strong>modo prática</strong>: não conta para o comparativo com a turma nem muda sua nota oficial.
                </li>
              ) : (
                <li>
                  Só a <strong>1ª tentativa</strong> conta para o comparativo com a turma. O gabarito aparece só ao finalizar.
                </li>
              )}
            </ul>
          </div>

          {clampWarning && canStart && (
            <p className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              O simulado fecha em breve: iniciando agora, seu tempo será menor que a duração total.
            </p>
          )}

          {officialSession && (
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href={`/simulados/${exam.id}/resultado`}>Ver resultado oficial</Link>
            </Button>
          )}

          {canStart ? (
            <form action={startMockExamAction.bind(null, exam.id)}>
              <Button type="submit" size="lg" className="w-full">
                <Play className="h-5 w-5" />
                {officialSession ? "Praticar novamente" : "Iniciar simulado"}
              </Button>
            </form>
          ) : (
            <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-center text-sm text-[var(--muted-foreground)]">
              {officialSession
                ? "Praticar novamente não está mais disponível — o simulado encerrou."
                : windowState === "futuro" && exam.opensAt
                ? `Abre em ${formatDateTimeBR(exam.opensAt)}.`
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
