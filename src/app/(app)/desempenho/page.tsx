import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock,
  Flame,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressRing, quotaTone } from "@/components/ui/progress";
import { DailyActivityChart, StatTile, SubjectAccuracyBars } from "@/components/performance-charts";
import { WeekStrip } from "@/components/week-strip";
import { formatDateBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import {
  getDailyActivity,
  getPerformanceSummary,
  getRecentMockExamResults,
  getSubjectBreakdown,
  getWorstTopics
} from "@/lib/performance";
import { getDueReviewSummary } from "@/lib/review";
import { getDailyGoalProgress, getStreak } from "@/lib/streaks";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { getUsageSummary, quotaAlertStep, type MeterStatus, type UsageSummary } from "@/lib/usage/ledger";
import { cn } from "@/lib/utils";

/**
 * Painel do aluno — a tela inicial depois do login.
 *
 * A ordem não é decorativa. O topo responde "o que eu faço AGORA" (meta do dia, sequência,
 * revisões vencendo); o meio mostra o hábito se formando (semana) e o quanto de plano ainda
 * resta; só depois vêm as estatísticas de análise. Antes disto era um relatório: começava
 * pelos números totais e não dizia a ninguém o que fazer em seguida.
 *
 * Os ganchos de retorno são fatos verificáveis — sequência real, meta real, fila real de
 * repetição espaçada. Nada de XP ou moeda inventada: num produto de concurso, pontinho
 * fictício corrói a confiança que o resto do sistema tenta construir.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);

  const [summary, subjects, daily, worstTopics, mockExams, streak, goal, dueReviews, usage] = await Promise.all([
    getPerformanceSummary(user.id),
    getSubjectBreakdown(user.id),
    getDailyActivity(user.id, 30),
    getWorstTopics(user.id, { minAttempts: 5, limit: 5 }),
    getRecentMockExamResults(user.id),
    getStreak(user.id),
    getDailyGoalProgress(user.id, user.dailyQuestionGoal),
    getDueReviewSummary(user.id),
    getUsageSummary(user)
  ]);

  const firstName = user.name.split(" ")[0];

  if (summary.total === 0) {
    return <EmptyState firstName={firstName} usage={usage} />;
  }

  const last7Accuracy = summary.last7Total ? Math.round((summary.last7Correct / summary.last7Total) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Olá, {firstName}</h1>
          <p className="text-[var(--muted-foreground)]">{buildGreetingLine(streak, goal, dueReviews.total)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/tutorial">
              <HelpCircle className="h-4 w-4" />
              Tutorial
            </Link>
          </Button>
          <Button asChild>
            <Link href="/ai">
              <Sparkles className="h-4 w-4" />
              Gerar questões
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Hoje: o que fazer agora ── */}
      <div className="grid gap-4 lg:grid-cols-3" data-testid="today-cards">
        <TodayGoalCard goal={goal} />
        <StreakCard streak={streak} />
        <DueReviewsCard total={dueReviews.total} topSubject={dueReviews.bySubject[0]?.subjectName} />
      </div>

      {/* ── Hábito + cota ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-[var(--primary)]" />
              Sua semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeekStrip rows={daily} />
          </CardContent>
        </Card>
        <QuotaCard usage={usage} />
      </div>

      {/* ── Números ── */}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
            Últimos 30 dias
          </CardTitle>
          <CardDescription>Questões respondidas por dia — constância importa mais que volume.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyActivityChart rows={daily} days={30} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="subject-accuracy-card">
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

        <Card data-testid="worst-topics-card">
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
                Responda mais questões para identificarmos seus pontos fracos (mínimo de 5 tentativas por assunto).
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

/** Uma frase que resume o estado do dia — o resto da tela detalha. */
function buildGreetingLine(
  streak: { current: number; activeToday: boolean },
  goal: { goal: number | null; answeredToday: number },
  dueTotal: number
): string {
  if (goal.goal && goal.answeredToday >= goal.goal) return "Meta de hoje batida. O resto é lucro.";
  if (dueReviewsAreUrgent(dueTotal)) return `Você tem ${dueTotal} ${dueTotal === 1 ? "questão vencida" : "questões vencidas"} para revisar hoje.`;
  if (streak.current > 0 && !streak.activeToday) {
    return `Sua sequência de ${streak.current} ${streak.current === 1 ? "dia" : "dias"} continua se você responder hoje.`;
  }
  if (goal.answeredToday > 0) return `Você já respondeu ${goal.answeredToday} hoje. Bom ritmo.`;
  return "Pronto para começar o dia de estudo?";
}

function dueReviewsAreUrgent(total: number) {
  return total > 0;
}

function TodayGoalCard({ goal }: { goal: { goal: number | null; answeredToday: number; percent: number } }) {
  if (!goal.goal) {
    return (
      <Card>
        <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold">Hoje</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{goal.answeredToday}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {goal.answeredToday === 1 ? "questão respondida" : "questões respondidas"}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/perfil#preferencias">Definir meta diária</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const done = goal.answeredToday >= goal.goal;
  return (
    <Card className={cn(done && "border-[var(--success)]")}>
      <CardContent className="flex h-full items-center gap-4 p-5">
        <ProgressRing
          value={goal.answeredToday}
          total={goal.goal}
          tone={done ? "success" : "primary"}
          label={`Meta diária: ${goal.answeredToday} de ${goal.goal} questões`}
        >
          <span className="text-xl font-bold tabular-nums">{goal.answeredToday}</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">de {goal.goal}</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Meta de hoje</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {done
              ? "Batida! Continue se quiser adiantar a de amanhã."
              : `Faltam ${goal.goal - goal.answeredToday} para fechar o dia.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Marcos existem para dar um alvo próximo — sem eles a sequência é só um número que sobe. */
const STREAK_MILESTONES = [7, 30, 100, 365];

function StreakCard({ streak }: { streak: { current: number; best: number; activeToday: boolean } }) {
  const nextMilestone = STREAK_MILESTONES.find((milestone) => milestone > streak.current);
  const atRisk = streak.current > 0 && !streak.activeToday;

  return (
    <Card className={cn(atRisk && "border-[var(--warning)]")}>
      <CardContent className="flex h-full items-center gap-4 p-5">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
            streak.current > 0 ? "bg-amber-100" : "bg-[var(--muted)]"
          )}
        >
          <Flame className={cn("h-7 w-7", streak.current > 0 ? "text-amber-600" : "text-[var(--muted-foreground)]")} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">
            {streak.current} <span className="text-sm font-medium">{streak.current === 1 ? "dia" : "dias"}</span>
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {atRisk
              ? "Responda 1 questão hoje para não perder a sequência."
              : nextMilestone
                ? `Faltam ${nextMilestone - streak.current} para ${nextMilestone} dias. Recorde: ${streak.best}.`
                : `Recorde: ${streak.best} dias.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Fila de revisão espaçada — o gancho de retorno mais forte que temos, e honesto: são
 * questões que o algoritmo agendou para hoje, não um lembrete inventado.
 */
function DueReviewsCard({ total, topSubject }: { total: number; topSubject?: string }) {
  return (
    <Card className={cn(total > 0 && "border-[var(--primary)]")}>
      <CardContent className="flex h-full items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{total}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {total === 0
              ? "Nenhuma revisão vencida. Em dia!"
              : `${total === 1 ? "questão vence" : "questões vencem"} hoje${topSubject ? ` · ${topSubject}` : ""}`}
          </p>
        </div>
        {total > 0 && (
          <Button asChild size="sm">
            <Link href="/revisao">
              <RotateCcw className="h-4 w-4" />
              Revisar
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cota do plano.
 *
 * O aviso acende nos degraus de 50/75/90% (ver QUOTA_ALERT_STEPS) e não mais só em 80%: quem
 * gera blocos de 20 questões pula de 65% direto para 100% numa ação, e um aviso único no fim
 * chega junto com o bloqueio, quando já não dá para fazer nada com a informação.
 *
 * O convite para upgrade continua saindo só a partir de 90%. Nos degraus de baixo o card
 * informa; transformar "metade da cota" em pitch de venda é o tipo de coisa que faz o aluno
 * parar de ler o aviso justamente quando ele passa a importar.
 *
 * Em modo sombra o medidor ainda não bloqueia nada, então o card não é exibido: mostrar uma
 * cota que não vale seria pior que não mostrar nada.
 */
function QuotaCard({ usage }: { usage: UsageSummary }) {
  if (usage.kind === "ADMIN" || !usage.enforcement) return null;

  const questions = usage.questions;
  const percent = questions.percent;
  const tone = quotaTone(percent);
  const step = quotaAlertStep(percent);
  const showUpgrade = step !== null && step >= 90;

  const limitLabel = questions.limits.perMonth ?? questions.limits.perDay;
  if (limitLabel === null) return null;

  const isMonthly = questions.limits.perMonth !== null;
  const used = isMonthly ? questions.usedMonth : questions.usedToday;
  const remaining = Math.max(0, limitLabel - used);

  return (
    <Card className={cn(showUpgrade && "border-[var(--warning)]")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-[var(--primary)]" />
          Sua cota de questões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">{isMonthly ? "Neste ciclo" : "Hoje"}</span>
            <span className="tabular-nums">
              <strong>{used}</strong> de {limitLabel}
            </span>
          </div>
          <Progress
            className="mt-2"
            value={used}
            total={limitLabel}
            tone={tone}
            label={`Cota de questões: ${used} de ${limitLabel}`}
          />
        </div>

        {isMonthly && questions.limits.perDay !== null && <DailyBurstLine questions={questions} />}

        {showUpgrade ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning-soft-foreground)]">
            <span>
              {step === 100
                ? "Sua cota acabou."
                : `Você já usou ${percent}% da cota — restam ${remaining} questões.`}
            </span>
            <Button asChild size="sm">
              <Link href={usage.kind === "TRIAL" ? "/assinatura" : "/pricing"}>
                {usage.kind === "TRIAL" ? "Assinar" : "Fazer upgrade"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : step !== null ? (
          <p className="rounded-md bg-[var(--surface-subtle)] p-3 text-sm">
            Você já usou <strong>{percent}%</strong> da cota — restam {remaining} questões, e ela renova em{" "}
            {formatDate(new Date(usage.period.end))}.
          </p>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">
            Renova em {formatDate(new Date(usage.period.end))}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DailyBurstLine({ questions }: { questions: MeterStatus }) {
  const perDay = questions.limits.perDay;
  if (perDay === null) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-[var(--muted-foreground)]">
        <span>Hoje</span>
        <span className="tabular-nums">
          {questions.usedToday} de {perDay}
        </span>
      </div>
      <Progress
        className="mt-1.5 h-1.5"
        value={questions.usedToday}
        total={perDay}
        tone={quotaTone(perDay ? Math.round((questions.usedToday / perDay) * 100) : 0)}
        label={`Questões de hoje: ${questions.usedToday} de ${perDay}`}
      />
    </div>
  );
}

/**
 * Primeira visita: onboarding de 3 passos em vez de um card avisando que não há dados.
 * A tela precisa dizer o que fazer, não constatar o vazio.
 */
function EmptyState({ firstName, usage }: { firstName: string; usage: UsageSummary }) {
  const steps = [
    {
      title: "Gere seu primeiro bloco",
      description: "Peça no chat as questões da matéria que você mais estuda — leva menos de um minuto.",
      href: "/ai",
      cta: "Abrir o chat",
      icon: Sparkles
    },
    {
      title: "Responda e veja o gabarito",
      description: "Cada questão vem com justificativa. É respondendo que o painel começa a te conhecer.",
      href: "/questoes",
      cta: "Ver banco de questões",
      icon: Target
    },
    {
      title: "Volte amanhã",
      description: "A partir daí montamos suas revisões pelos erros e acompanhamos sua sequência de estudo.",
      href: "/perfil#preferencias",
      cta: "Definir meta diária",
      icon: Flame
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bem-vindo, {firstName}</h1>
        <p className="text-[var(--muted-foreground)]">
          Seu painel ainda está vazio porque você não respondeu nenhuma questão. Três passos para mudar isso:
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <Card key={step.title}>
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary-soft-foreground)]">
                  {index + 1}
                </span>
                <step.icon className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{step.title}</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{step.description}</p>
              </div>
              <Button asChild size="sm" variant={index === 0 ? "default" : "outline"}>
                <Link href={step.href}>
                  {step.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {usage.kind === "TRIAL" && usage.enforcement && usage.questions.limits.perMonth !== null && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-[var(--muted-foreground)]">
              No plano gratuito você gera até <strong>{usage.questions.limits.perMonth} questões por mês</strong>.
              Assinando, os blocos ficam maiores e a cota acompanha seu ritmo.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/assinatura">Ver planos</Link>
            </Button>
          </CardContent>
        </Card>
      )}
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
  return formatDateBR(date, "medium");
}
