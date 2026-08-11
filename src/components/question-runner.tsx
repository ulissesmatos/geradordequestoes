"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BadgeCheck, Check, ChevronDown, ChevronUp, Lock, RotateCcw, Timer, Trophy, X } from "lucide-react";
import { answerQuestionAction } from "@/app/(app)/actions/question-actions";
import { FavoriteButton } from "@/components/favorite-button";
import { MathText } from "@/components/math-text";
import { ReportQuestionButton } from "@/components/report-question-button";
import { ReviewedBadge } from "@/components/reviewed-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayMonthBR } from "@/lib/dates";
import { cn } from "@/lib/utils";

type RunnerOption = {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  order: number;
};

type RunnerQuestion = {
  id: string;
  statement: string;
  /** Texto de apoio compartilhado (situação hipotética, trecho de lei) — algumas questões difíceis têm; a maioria não. */
  supportText?: string | null;
  format?: "CERTO_ERRADO" | "MULTIPLA_ESCOLHA";
  answer?: "CERTO" | "ERRADO" | null;
  explanation: string;
  subject: { name: string };
  topic: { name: string };
  options?: RunnerOption[];
  isFavorited?: boolean;
  /** Selo de confiança (ex.: "Baseada em prova real · Prova PC-MA 2023"). */
  sourceBadge?: string;
  /** true quando um admin já revisou/aprovou o gabarito manualmente (ver ReviewedBadge). */
  isReviewed?: boolean;
};

type SelectedAnswer = {
  label: string;
  value: string;
  isCorrect: boolean;
};

export function QuestionRunner({
  questions: questionsProp,
  mode,
  initialAnswers,
  reviewMode = false,
  persistAnswers = true,
  showTools = true,
  lockedFrom,
  lockHref = "/pricing"
}: {
  questions: RunnerQuestion[];
  mode: "study" | "simulado";
  initialAnswers?: Record<string, SelectedAnswer>;
  /** Sessão de revisão espaçada: some da fila de hoje assim que respondida (voltou para uma
   *  data futura), então a tela final mostra quando cada questão volta a aparecer — senão
   *  "0 revisões pendentes" logo depois de acertar parece que os acertos sumiram. */
  reviewMode?: boolean;
  /** false = resposta só fica no estado local do navegador, sem chamar o servidor — usado no
   *  link público (/q/<id>) para visitante sem conta, que não tem onde persistir uma tentativa. */
  persistAnswers?: boolean;
  /** false esconde favoritar/reportar — ambos exigem conta, então somem para visitante anônimo. */
  showTools?: boolean;
  /** 1-based: a partir desta posição a questão fica atrás de um paywall (bloco compartilhado
   *  como "só assinantes" respondido por conta gratuita). undefined = nada bloqueado. */
  lockedFrom?: number;
  lockHref?: string;
}) {
  // Congela a lista recebida no primeiro render. Toda Server Action (como responder uma
  // questão) faz o Next.js revalidar e re-executar o Server Component da rota atual — na
  // revisão espaçada isso re-busca as questões vencidas, e a que acabou de ser respondida já
  // sai dessa lista. Sem essa cópia local, a prop `questions` encolhe no meio da sessão e o
  // `index` (que não muda) passa a apontar para outra questão: a tela troca sozinha, sem o
  // usuário clicar em nada, e o gabarito/explicação da questão respondida nunca chega a aparecer.
  const [questions] = useState(questionsProp);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SelectedAnswer>>(initialAnswers ?? {});
  const [nextReviewDates, setNextReviewDates] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const [finished, setFinished] = useState(initialAnswers != null && Object.keys(initialAnswers).length > 0);
  const [answerError, setAnswerError] = useState<{ message: string; limitReached: boolean } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSupport, setShowSupport] = useState(true);
  const [canAdvance, setCanAdvance] = useState(false);
  const current = questions[index];
  const selected = current ? answers[current.id] : undefined;

  // Zera o cronômetro e reabre o texto de apoio só ao trocar de questão.
  useEffect(() => {
    setElapsedSeconds(0);
    setShowSupport(true);
  }, [current?.id]);

  // Trava "Próxima questão" por um instante após responder — sem isso, um clique/toque em
  // sequência (o mesmo gesto usado pra marcar a resposta) ativa o avanço antes de a explicação
  // aparecer na tela, e o usuário nunca chega a ler o comentário da questão.
  useEffect(() => {
    if (mode !== "study" || !selected) return;
    setCanAdvance(false);
    const timer = window.setTimeout(() => setCanAdvance(true), 1500);
    return () => window.clearTimeout(timer);
  }, [mode, selected]);

  // Congela o cronômetro assim que a questão é respondida.
  useEffect(() => {
    if (!current || selected) return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [current, selected]);

  // Recomeça o bloco do zero (as tentativas anteriores continuam no histórico do servidor).
  function restart() {
    setAnswers({});
    setIndex(0);
    setFinished(false);
    setAnswerError(null);
    setStartedAt(Date.now());
  }

  const score = useMemo(
    () => questions.filter((question) => answers[question.id]?.isCorrect).length,
    [answers, questions]
  );

  if (questions.length === 0) {
    return <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Nenhuma questão encontrada para este bloco.</p>;
  }

  if (finished) {
    // Denominador do aproveitamento ignora questões bloqueadas — sem isso, um bloco "só
    // assinantes" pela metade travado parece um desempenho ruim em vez de um paywall.
    const unlockedTotal = lockedFrom ? Math.max(0, Math.min(questions.length, lockedFrom - 1)) : questions.length;
    const lockedCount = questions.length - unlockedTotal;
    const answeredCount = questions.filter((question) => answers[question.id]).length;
    const wrong = answeredCount - score;
    const percent = unlockedTotal > 0 ? Math.round((score / unlockedTotal) * 100) : 0;
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                  <Trophy className="h-7 w-7 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{percent}% de aproveitamento</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Você respondeu {answeredCount} de {unlockedTotal} {unlockedTotal === 1 ? "questão" : "questões"}.
                  </p>
                  {lockedCount > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-[var(--primary)]">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      {lockedCount === 1 ? "Mais 1 questão bloqueada" : `Mais ${lockedCount} questões bloqueadas`} — assine para desbloquear.
                    </p>
                  )}
                  {reviewMode && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Cada questão já saiu da fila de hoje e voltou para uma data futura — quem você acertou demora mais
                      para reaparecer que quem você errou. Por isso a revisão pode zerar assim que você termina: veja
                      quando cada uma volta na correção abaixo.
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={restart}>
                <RotateCcw className="h-4 w-4" />
                Responder novamente
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="rounded-[var(--radius)] border border-[var(--success)] bg-[var(--success-soft)] p-3 text-center">
                <p className="text-2xl font-bold text-[var(--success-soft-foreground)]">{score}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success-soft-foreground)]">{score === 1 ? "Acerto" : "Acertos"}</p>
              </div>
              <div className="rounded-[var(--radius)] border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-3 text-center">
                <p className="text-2xl font-bold text-[var(--danger-soft-foreground)]">{wrong}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger-soft-foreground)]">{wrong === 1 ? "Erro" : "Erros"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Correção questão a questão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((question, questionIndex) => {
              const selected = answers[question.id];
              const correct = getCorrectLabel(question);
              const isLocked = lockedFrom != null && questionIndex + 1 >= lockedFrom;

              if (isLocked) {
                return (
                  <div key={question.id} className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--muted-foreground)]">Questão {questionIndex + 1}</p>
                      {showTools && <FavoriteButton questionId={question.id} initialFavorited={question.isFavorited ?? false} />}
                    </div>
                    <p className="mt-1 opacity-60"><MathText text={question.statement} /></p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] p-3">
                      <Lock className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                      <p className="flex-1 text-sm text-[var(--primary-soft-foreground)]">Gabarito e explicação liberados para assinantes.</p>
                      <Button asChild size="sm">
                        <Link href={lockHref}>Ver planos →</Link>
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={question.id}
                  className={cn(
                    "rounded-md border p-4",
                    selected?.isCorrect
                      ? "border-[var(--success)] bg-[var(--success-soft)]"
                      : "border-[var(--danger-soft-border)] bg-[var(--danger-soft)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--muted-foreground)]">Questão {questionIndex + 1}</p>
                      {question.isReviewed && <ReviewedBadge />}
                    </div>
                    {showTools && (
                      <div className="flex items-center gap-1">
                        <ReportQuestionButton questionId={question.id} />
                        <FavoriteButton questionId={question.id} initialFavorited={question.isFavorited ?? false} />
                      </div>
                    )}
                  </div>
                  {question.supportText && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Texto de apoio</p>
                      <p className="whitespace-pre-line text-xs leading-5 text-[var(--foreground)]"><MathText text={question.supportText} /></p>
                    </div>
                  )}
                  <p className="mt-1"><MathText text={question.statement} /></p>
                  <p
                    className={
                      selected?.isCorrect
                        ? "mt-2 font-semibold text-[var(--success-soft-foreground)]"
                        : "mt-2 font-semibold text-[var(--danger-soft-foreground)]"
                    }
                  >
                    {selected?.isCorrect ? "✓" : "✗"} Sua resposta: {selected?.label ?? "—"} · Gabarito: {correct}
                  </p>
                  {reviewMode && nextReviewDates[question.id] && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                      <RotateCcw className="h-3 w-3 shrink-0" />
                      {formatReviewReturn(nextReviewDates[question.id])}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]"><MathText text={question.explanation} /></p>
                  {question.sourceBadge && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                      {question.sourceBadge}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  const showFeedback = mode === "study" && selected;
  const options = getRenderableOptions(current);
  const isLocked = lockedFrom != null && index + 1 >= lockedFrom;

  function submit(payload: { label: string; value: string; isCorrect: boolean; userAnswer?: "CERTO" | "ERRADO"; optionId?: string }) {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const questionId = current.id;
    setAnswers((previous) => ({
      ...previous,
      [questionId]: { label: payload.label, value: payload.value, isCorrect: payload.isCorrect }
    }));
    // Visitante sem conta: não existe onde persistir a tentativa, então a correção fica só no
    // estado local do navegador — sem round-trip ao servidor, sem chance de erro pra reverter.
    if (!persistAnswers) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("questionId", questionId);
      if (payload.userAnswer) formData.set("userAnswer", payload.userAnswer);
      if (payload.optionId) formData.set("selectedOptionId", payload.optionId);
      formData.set("userAnswerText", payload.label);
      formData.set("timeSpentSeconds", String(elapsed));
      const result = await answerQuestionAction(formData);
      if (!result.ok) {
        // Desfaz a resposta otimista — ela não foi registrada no servidor.
        setAnswers((previous) => {
          const next = { ...previous };
          delete next[questionId];
          return next;
        });
        setAnswerError({ message: result.error, limitReached: result.limitReached ?? false });
      } else if (result.nextReviewDueAt) {
        setNextReviewDates((previous) => ({ ...previous, [questionId]: result.nextReviewDueAt as string }));
      }
    });
  }

  function next() {
    if (index + 1 === questions.length) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
    setStartedAt(Date.now());
  }

  return (
    <Card className="overflow-hidden" data-testid="question-runner">
      <div className="h-1.5 w-full bg-[var(--muted)]">
        <div
          className="h-full bg-[var(--primary)] transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CardTitle>Questão {index + 1} de {questions.length}</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">
              <Timer className="h-3.5 w-3.5" />
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
          {showTools && (
            <div className="flex items-center gap-1">
              <ReportQuestionButton questionId={current.id} />
              <FavoriteButton questionId={current.id} initialFavorited={current.isFavorited ?? false} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {current.subject.name} / {current.topic.name} / {current.format === "MULTIPLA_ESCOLHA" ? "Múltipla escolha" : "Certo/Errado"}
          </p>
          {current.isReviewed && <ReviewedBadge />}
        </div>
        {mode === "simulado" && (
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Simulado — correção ao final</p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {current.supportText && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)]">
            <button
              type="button"
              onClick={() => setShowSupport((value) => !value)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Texto de apoio</span>
              <span className="flex items-center gap-1 text-xs font-medium text-[var(--primary)]">
                {showSupport ? "Ocultar" : "Mostrar"}
                {showSupport ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
            {showSupport && (
              <p className="whitespace-pre-line px-4 pb-4 text-sm leading-6 text-[var(--foreground)]">
                <MathText text={current.supportText} />
              </p>
            )}
          </div>
        )}
        <p className="text-base leading-7 md:text-lg md:leading-8"><MathText text={current.statement} /></p>
        {isLocked ? (
          <>
            <div className="flex flex-col items-center gap-3 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] p-6 text-center">
              <Lock className="h-8 w-8 text-[var(--primary)]" />
              <p className="font-semibold text-[var(--primary-soft-foreground)]">Esta questão é exclusiva para assinantes</p>
              <p className="text-sm text-[var(--primary-soft-foreground)]">
                Ela já está salva aqui — assine um plano para responder e ver o gabarito com a explicação.
              </p>
              <Button asChild size="sm">
                <Link href={lockHref}>Ver planos →</Link>
              </Button>
            </div>
            <Button variant="outline" onClick={next}>
              {index + 1 === questions.length ? "Ver resultado" : "Próxima questão"}
            </Button>
          </>
        ) : (
          <>
            {answerError && (
              <div
                className={cn(
                  "rounded-md border p-4",
                  answerError.limitReached
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
                    : "border-[var(--danger-soft-border)] bg-[var(--danger-soft)] text-[var(--danger-soft-foreground)]"
                )}
              >
                <p className="flex items-center gap-2 font-semibold">
                  {answerError.limitReached && <Lock className="h-4 w-4" />}
                  {answerError.limitReached ? "Limite diário do teste gratuito atingido" : "Não foi possível registrar a resposta"}
                </p>
                <p className="mt-1 text-sm">{answerError.message}</p>
                {answerError.limitReached && (
                  <Button asChild size="sm" className="mt-3">
                    <Link href="/pricing">Ver planos →</Link>
                  </Button>
                )}
              </div>
            )}
            <div className="grid gap-3">
              {options.map((option) => (
                <Button
                  key={option.key}
                  disabled={Boolean(selected) || isPending || answerError?.limitReached}
                  size="lg"
                  variant="outline"
                  aria-pressed={selected?.label === option.label}
                  className={`h-auto justify-start whitespace-normal py-4 text-left ${
                    selected?.label === option.label ? "border-[var(--primary)] ring-2 ring-[var(--primary)] !opacity-100" : ""
                  }`}
                  onClick={() => submit(option)}
                >
                  {option.icon}
                  <span className="font-bold">{option.label})</span>
                  <span><MathText text={option.value} /></span>
                </Button>
              ))}
            </div>
            {showFeedback && (
              <div
                className={
                  selected.isCorrect
                    ? "rounded-md border border-[var(--success)] bg-[var(--success-soft)] p-4 text-[var(--success-soft-foreground)]"
                    : "rounded-md border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-4 text-[var(--danger-soft-foreground)]"
                }
              >
                <p className="font-semibold">{selected.isCorrect ? "Resposta correta" : `Resposta incorreta. Gabarito: ${getCorrectLabel(current)}`}</p>
                <p className="mt-2 text-sm"><MathText text={current.explanation} /></p>
                {current.sourceBadge && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium opacity-80">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                    {current.sourceBadge}
                  </p>
                )}
              </div>
            )}
            {selected && (
              <div className="flex flex-col items-start gap-1.5">
                <Button onClick={next} disabled={mode === "study" && !canAdvance}>
                  {index + 1 === questions.length ? "Finalizar" : "Próxima questão"}
                </Button>
                {mode === "study" && !canAdvance && (
                  <p className="text-xs text-[var(--muted-foreground)]">Leia a explicação antes de continuar…</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function getRenderableOptions(question: RunnerQuestion) {
  if (question.options?.length) {
    return question.options
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((option) => ({
        key: option.id,
        label: option.label,
        value: option.text,
        isCorrect: option.isCorrect,
        optionId: option.id,
        userAnswer: option.label === "C" ? ("CERTO" as const) : option.label === "E" ? ("ERRADO" as const) : undefined,
        icon: option.isCorrect ? <Check className="h-4 w-4 opacity-0" /> : <X className="h-4 w-4 opacity-0" />
      }));
  }

  return [
    {
      key: "CERTO",
      label: "C",
      value: "Certo",
      isCorrect: question.answer === "CERTO",
      userAnswer: "CERTO" as const,
      icon: <Check className="h-5 w-5" />
    },
    {
      key: "ERRADO",
      label: "E",
      value: "Errado",
      isCorrect: question.answer === "ERRADO",
      userAnswer: "ERRADO" as const,
      icon: <X className="h-5 w-5" />
    }
  ];
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getCorrectLabel(question: RunnerQuestion) {
  const correct = question.options?.find((option) => option.isCorrect);
  if (correct) return `${correct.label}) ${correct.text}`;
  return question.answer ?? "sem gabarito";
}

/** "Volta amanhã" / "Volta em N dias (dd/mm)" — a data de retorno de UMA questão à revisão. */
function formatReviewReturn(dueAtIso: string) {
  const dueAt = new Date(dueAtIso);
  const days = Math.max(1, Math.round((dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const dateLabel = formatDayMonthBR(dueAt);
  return days <= 1 ? `Volta amanhã para revisão (${dateLabel})` : `Volta em ${days} dias para revisão (${dateLabel})`;
}
