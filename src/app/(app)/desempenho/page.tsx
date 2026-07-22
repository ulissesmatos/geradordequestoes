import Link from "next/link";
import { BarChart3, CalendarDays, Clock, Flame, Sparkles, Target, TrendingDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DailyActivityChart, StatTile, SubjectAccuracyBars } from "@/components/performance-charts";
import { requireUser } from "@/lib/guards";
import {
  getDailyActivity,
  getPerformanceSummary,
  getRecentMockExamResults,
  getSubjectBreakdown,
  getWorstTopics
} from "@/lib/performance";
import { getDailyGoalProgress, getStreak } from "@/lib/streaks";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

export default async function PerformancePage() {
  const user = await requireUser();
  await requireActiveSubscription(user);

  const [summary, subjects, daily, worstTopics, mockExams, streak, goal] = await Promise.all([
    getPerformanceSummary(user.id),
    getSubjectBreakdown(user.id),
    getDailyActivity(user.id, 30),
    getWorstTopics(user.id, { minAttempts: 5, limit: 5 }),
    getRecentMockExamResults(user.id),
    getStreak(user.id),
    getDailyGoalProgress(user.id, user.dailyQuestionGoal)
  ]);

  if (summary.total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-8">
            <p className="text-[var(--muted-foreground)]">
              Você ainda não respondeu nenhuma questão. Responda suas primeiras questões para ver suas
              estatísticas aqui: taxa de acerto por matéria, evolução diária e os assuntos que mais precisam
              de atenção.
            </p>
            <Button asChild>
              <Link href="/questoes/gerar">
                <Sparkles className="h-4 w-4" />
                Gerar minhas primeiras questões
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const last7Accuracy = summary.last7Total
    ? Math.round((summary.last7Correct / summary.last7Total) * 100)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* ── Constância: streak + meta diária ── */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                streak.current > 0 ? "bg-amber-100" : "bg-[var(--muted)]"
              )}
            >
              <Flame className={cn("h-6 w-6", streak.current > 0 ? "text-amber-600" : "text-[var(--muted-foreground)]")} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold">
                {streak.current} {streak.current === 1 ? "dia seguido" : "dias seguidos"}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {streak.current > 0 && !streak.activeToday
                  ? "Responda 1 questão hoje para manter a sequência!"
                  : `Seu recorde: ${streak.best} ${streak.best === 1 ? "dia" : "dias"}.`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            {goal.goal ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Meta de hoje</span>
                  <span className="tabular-nums">
                    <strong>{goal.answeredToday}</strong> de {goal.goal} questões
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className={cn("h-full rounded-full transition-all", goal.percent >= 100 ? "bg-emerald-500" : "bg-[var(--primary)]")}
                    style={{ width: `${goal.percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {goal.percent >= 100
                    ? "Meta batida! 🎉 Continue se quiser adiantar a de amanhã."
                    : `Faltam ${Math.max(0, goal.goal - goal.answeredToday)} para bater a meta.`}
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Sem meta diária definida</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Uma meta de questões por dia ajuda a manter a constância.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/perfil#preferencias">Definir meta</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={String(summary.total)} label="Questões respondidas" />
        <StatTile
          value={`${summary.accuracy}%`}
          label="Taxa de acerto geral"
          hint={`${summary.correct} ${summary.correct === 1 ? "acerto" : "acertos"} no total`}
        />
        <StatTile
          value={String(summary.last7Total)}
          label="Nos últimos 7 dias"
          hint={last7Accuracy !== null ? `${last7Accuracy}% de acerto na semana` : undefined}
        />
        <StatTile value={formatSeconds(summary.avgSeconds)} label="Tempo médio por questão" />
      </div>

      {/* ── Evolução diária ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[var(--primary)]" />
            Últimos 30 dias
          </CardTitle>
          <CardDescription>Questões respondidas por dia — constância importa mais que volume.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyActivityChart rows={daily} days={30} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Por matéria ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
              Acerto por matéria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Sem dados ainda.</p>
            ) : (
              <SubjectAccuracyBars rows={subjects} />
            )}
          </CardContent>
        </Card>

        {/* ── Piores tópicos ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-[var(--primary)]" />
              Assuntos para reforçar
            </CardTitle>
            <CardDescription>Menor taxa de acerto (mínimo de 5 tentativas).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {worstTopics.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Responda mais questões para identificarmos seus pontos fracos (mínimo de 5 tentativas por
                assunto).
              </p>
            ) : (
              worstTopics.map((topic) => {
                const accuracy = Math.round((topic.correct / topic.total) * 100);
                const prompt = `Gere questões de revisão sobre ${topic.topicName} em ${topic.subjectName}, focando nos pontos que mais caem em prova`;
                return (
                  <div
                    key={topic.topicId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{topic.topicName}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {topic.subjectName} · {accuracy}% de acerto ({topic.correct}/{topic.total})
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ai?new=1&prompt=${encodeURIComponent(prompt)}`}>
                        <Target className="h-4 w-4" />
                        Revisar
                      </Link>
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Simulados recentes ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[var(--primary)]" />
            Simulados recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mockExams.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted-foreground)]">Você ainda não concluiu nenhum simulado.</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/simulados">
                  <Clock className="h-4 w-4" />
                  Ver simulados
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {mockExams.map((session) => (
                <Link
                  key={session.id}
                  href={`/simulados/${session.mockExamId}/resultado`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3 transition hover:border-[var(--primary)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.mockExam.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {session.finishedAt ? formatDate(session.finishedAt) : "—"}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    Nota líquida <strong>{session.netScore ?? 0}</strong>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {" "}
                      ({session.correctCount ?? 0}C / {session.wrongCount ?? 0}E / {session.blankCount ?? 0}B)
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Desempenho</h1>
      <p className="text-[var(--muted-foreground)]">
        Suas estatísticas de estudo: onde você está forte e o que precisa de reforço.
      </p>
    </div>
  );
}

function formatSeconds(seconds: number) {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}min ${seconds % 60}s`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}
