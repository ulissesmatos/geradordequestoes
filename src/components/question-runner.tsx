"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BadgeCheck, Check, ChevronDown, ChevronUp, Lock, RotateCcw, Timer, Trophy, X } from "lucide-react";
import { answerQuestionAction } from "@/app/(app)/actions/question-actions";
import { FavoriteButton } from "@/components/favorite-button";
import { MathText } from "@/components/math-text";
import { ReportQuestionButton } from "@/components/report-question-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

type SelectedAnswer = {
  label: string;
  value: string;
  isCorrect: boolean;
};

export function QuestionRunner({
  questions,
  mode,
  initialAnswers,
  reviewMode = false
}: {
  questions: RunnerQuestion[];
  mode: "study" | "simulado";
  initialAnswers?: Record<string, SelectedAnswer>;
  /** Sessão de revisão espaçada: some da fila de hoje assim que respondida (voltou para uma
   *  data futura), então a tela final mostra quando cada questão volta a aparecer — senão
   *  "0 revisões pendentes" logo depois de acertar parece que os acertos sumiram. */
  reviewMode?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SelectedAnswer>>(initialAnswers ?? {});
  const [nextReviewDates, setNextReviewDates] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const [finished, setFinished] = useState(initialAnswers != null && Object.keys(initialAnswers).length > 0);
  const [answerError, setAnswerError] = useState<{ message: string; limitReached: boolean } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSupport, setShowSupport] = useState(true);
  const current = questions[index];
  const selected = current ? answers[current.id] : undefined;

  // Zera o cronômetro e reabre o texto de apoio só ao trocar de questão.
  useEffect(() => {
    setElapsedSeconds(0);
    setShowSupport(true);
  }, [current?.id]);

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
    const answeredCount = questions.filter((question) => answers[question.id]).length;
    const wrong = answeredCount - score;
    const percent = Math.round((score / questions.length) * 100);
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
                    Você respondeu {answeredCount} de {questions.length} {questions.length === 1 ? "questão" : "questões"}.
                  </p>
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
              <div className="rounded-[var(--radius)] border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{score}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{score === 1 ? "Acerto" : "Acertos"}</p>
              </div>
              <div className="rounded-[var(--radius)] border border-rose-200 bg-rose-50 p-3 text-center">
                <p className="text-2xl font-bold text-rose-700">{wrong}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">{wrong === 1 ? "Erro" : "Erros"}</p>
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
              return (
                <div
                  key={question.id}
                  className={cn(
                    "rounded-md border p-4",
                    selected?.isCorrect ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--muted-foreground)]">Questão {questionIndex + 1}</p>
                    <div className="flex items-center gap-1">
                      <ReportQuestionButton questionId={question.id} />
                      <FavoriteButton questionId={question.id} initialFavorited={question.isFavorited ?? false} />
                    </div>
                  </div>
                  {question.supportText && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Texto de apoio</p>
                      <p className="whitespace-pre-line text-xs leading-5 text-[var(--foreground)]"><MathText text={question.supportText} /></p>
                    </div>
                  )}
                  <p className="mt-1"><MathText text={question.statement} /></p>
                  <p className={selected?.isCorrect ? "mt-2 font-semibold text-emerald-800" : "mt-2 font-semibold text-rose-800"}>
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

  function submit(payload: { label: string; value: string; isCorrect: boolean; userAnswer?: "CERTO" | "ERRADO"; optionId?: string }) {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const questionId = current.id;
    setAnswers((previous) => ({
      ...previous,
      [questionId]: { label: payload.label, value: payload.value, isCorrect: payload.isCorrect }
    }));
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
    <Card className="overflow-hidden">
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
          <div className="flex items-center gap-1">
            <ReportQuestionButton questionId={current.id} />
            <FavoriteButton questionId={current.id} initialFavorited={current.isFavorited ?? false} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          {current.subject.name} / {current.topic.name} / {current.format === "MULTIPLA_ESCOLHA" ? "Múltipla escolha" : "Certo/Errado"}
        </p>
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
        {answerError && (
          <div
            className={cn(
              "rounded-md border p-4",
              answerError.limitReached
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
                : "border-rose-200 bg-rose-50 text-rose-900"
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
          <div className={selected.isCorrect ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" : "rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-900"}>
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
          <Button onClick={next}>{index + 1 === questions.length ? "Finalizar" : "Próxima questão"}</Button>
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
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(dueAt);
  return days <= 1 ? `Volta amanhã para revisão (${dateLabel})` : `Volta em ${days} dias para revisão (${dateLabel})`;
}
