import Link from "next/link";
import { CalendarClock, ListChecks, Timer } from "lucide-react";
import { MockExamStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { examSubjectLabel, getExamWindowState, getStudentTeamAccountId } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

type ExamBadge = { label: string; className: string };

export default async function MockExamsPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);

  const teamId = await getStudentTeamAccountId(user.id);
  const exams = await prisma.mockExam.findMany({
    where: {
      status: { in: [MockExamStatus.PUBLISHED, MockExamStatus.CLOSED] },
      OR: [{ teamAccountId: null }, ...(teamId ? [{ teamAccountId: teamId }] : [])]
    },
    include: {
      questionSet: { select: { quantity: true, subject: { select: { name: true } }, topic: { select: { name: true } } } },
      sessions: {
        where: { userId: user.id },
        select: { id: true, finishedAt: true, expiresAt: true, isPractice: true },
        orderBy: { startedAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const now = new Date();
  const visible = exams.filter((exam) => {
    // Simulado fechado que o aluno nunca fez não tem o que mostrar.
    if (exam.status === MockExamStatus.CLOSED && exam.sessions.length === 0) return false;
    return true;
  });

  function badgeFor(exam: (typeof exams)[number]): ExamBadge {
    // O status da listagem segue só a tentativa OFICIAL (1ª) — tentativas de prática seguintes
    // não mudam o selo "Concluído"/"Em andamento" mostrado aqui.
    const session = exam.sessions.find((item) => !item.isPractice) ?? exam.sessions[0];
    if (session?.finishedAt) return { label: "Concluído — ver resultado", className: "bg-emerald-100 text-emerald-800" };
    if (session && now <= session.expiresAt) return { label: "Em andamento", className: "bg-amber-100 text-amber-800" };
    if (session) return { label: "Concluído — ver resultado", className: "bg-emerald-100 text-emerald-800" };
    if (exam.status === MockExamStatus.CLOSED) return { label: "Encerrado", className: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
    const windowState = getExamWindowState(exam, now);
    if (windowState === "futuro") return { label: "Em breve", className: "bg-[var(--info-soft,#e0f2fe)] text-[var(--info,#0a5a8a)]" };
    if (windowState === "encerrado") return { label: "Encerrado", className: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
    return { label: "Aberto", className: "bg-[var(--primary-soft)] text-[var(--primary)]" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Simulados</h1>
        <p className="text-[var(--muted-foreground)]">
          Simulados oficiais cronometrados no estilo Cebraspe: certas menos erradas, em branco não pontua.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visible.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-[var(--muted-foreground)]">
              Nenhum simulado disponível no momento. Volte em breve!
            </CardContent>
          </Card>
        )}
        {visible.map((exam) => {
          const badge = badgeFor(exam);
          return (
            <Link key={exam.id} href={`/simulados/${exam.id}`}>
              <Card className="h-full transition hover:border-[var(--primary)]">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Timer className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                      {exam.title}
                    </CardTitle>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", badge.className)}>
                      {badge.label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-[var(--muted-foreground)]">
                  <p className="flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4" />
                    {exam.questionSet.quantity} questões · {examSubjectLabel(exam)}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" />
                    {exam.durationMinutes} min
                    {exam.closesAt ? ` · até ${formatDateTimeBR(exam.closesAt)}` : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
