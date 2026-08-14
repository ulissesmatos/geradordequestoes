"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Flag, Loader2, Timer, X } from "lucide-react";
import { finishMockExamAction, saveMockExamAnswerAction } from "@/app/(app)/simulados/actions";
import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type RunnerQuestion = { id: string; statement: string; subjectName: string };
type Answer = "CERTO" | "ERRADO" | null;

export function MockExamRunner({
  sessionId,
  title,
  questions,
  initialAnswers,
  expiresAtIso,
  serverNowIso,
  isPractice = false
}: {
  sessionId: string;
  title: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, Answer>;
  expiresAtIso: string;
  serverNowIso: string;
  /** Tentativa fora da 1ª (oficial) — mesmo layout/cronômetro, mas não conta pro comparativo com a turma. */
  isPractice?: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(initialAnswers);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isFinishing, startFinishing] = useTransition();

  // Countdown contra o relógio do SERVIDOR: skew calculado uma vez; o restante
  // é sempre expiresAt − agora corrigido (F5 não reseta; aba dormindo não atrasa).
  const skewRef = useRef(Date.parse(serverNowIso) - Date.now());
  const expiresAtMs = useMemo(() => Date.parse(expiresAtIso), [expiresAtIso]);
  const [remainingMs, setRemainingMs] = useState(() => expiresAtMs - (Date.now() + skewRef.current));
  const autoFinishedRef = useRef(false);

  const finish = useCallback(() => {
    if (autoFinishedRef.current) return;
    autoFinishedRef.current = true;
    startFinishing(async () => {
      await finishMockExamAction(sessionId);
    });
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = expiresAtMs - (Date.now() + skewRef.current);
      setRemainingMs(remaining);
      if (remaining <= 0) finish();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs, finish]);

  const current = questions[index];
  const currentAnswer = answers[current.id] ?? null;
  const answeredCount = questions.filter((q) => answers[q.id] != null).length;
  const blankCount = questions.length - answeredCount;

  function setAnswer(value: Answer) {
    // Toggle: clicar de novo na mesma opção desmarca (volta para em branco).
    const next = currentAnswer === value ? null : value;
    setAnswers((prev) => ({ ...prev, [current.id]: next }));
    startSaving(async () => {
      const result = await saveMockExamAnswerAction({
        sessionId,
        questionId: current.id,
        userAnswer: next
      });
      if (!result.ok && result.expired) {
        router.replace(window.location.pathname.replace(/\/?$/, "") + "/resultado");
      }
    });
  }

  const lowTime = remainingMs <= 5 * 60_000;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* Barra fixa: título + cronômetro + progresso */}
      <div className="sticky top-[61px] z-20 -mx-4 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:top-[73px]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
            {isPractice && (
              <Badge variant="secondary" className="shrink-0">
                Modo prática
              </Badge>
            )}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-bold tabular-nums",
              lowTime ? "bg-red-100 text-red-700 animate-pulse" : "bg-[var(--primary-soft)] text-[var(--primary)]"
            )}
          >
            <Timer className="h-4 w-4" />
            {formatCountdown(remainingMs)}
          </span>
        </div>
        <div className="h-1 w-full bg-[var(--muted)]">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-300"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Cartão-resposta: navegação livre */}
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const answered = answers[q.id] != null;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              title={`Questão ${i + 1}${answered ? " (respondida)" : " (em branco)"}`}
              className={cn(
                "h-9 w-9 rounded-md border text-sm font-semibold tabular-nums transition-colors",
                answered
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--primary)]",
                i === index && "ring-2 ring-[var(--ring)] ring-offset-1"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Questão atual */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] md:p-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Questão {index + 1} de {questions.length}
          </p>
          <Badge variant="outline">{current.subjectName}</Badge>
        </div>
        <p className="whitespace-pre-wrap leading-7"><MathText text={current.statement} /></p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <AnswerButton
            label="Certo"
            icon={Check}
            active={currentAnswer === "CERTO"}
            onClick={() => setAnswer("CERTO")}
          />
          <AnswerButton
            label="Errado"
            icon={X}
            active={currentAnswer === "ERRADO"}
            onClick={() => setAnswer("ERRADO")}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          {currentAnswer
            ? "Clique novamente na opção marcada para deixar em branco."
            : "Em branco — não pontua nem desconta."}
          {isSaving && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin align-[-2px]" />}
        </p>
      </div>

      {/* Navegação + finalizar */}
      <div className="flex items-center justify-between gap-2 pb-8">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)} disabled={isFinishing}>
          <Flag className="h-4 w-4" />
          Finalizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={index === questions.length - 1}
          onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogPanel>
          <DialogHeader
            title="Finalizar simulado?"
            description="Após finalizar não é possível alterar as respostas."
            onClose={() => setConfirmOpen(false)}
          />
          <div className="space-y-4 px-6 py-4">
            {blankCount > 0 && (
              <p className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Você tem {blankCount === 1 ? "1 questão em branco" : `${blankCount} questões em branco`}. Em branco não pontua nem desconta.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={isFinishing}>
                Continuar prova
              </Button>
              <Button size="sm" onClick={finish} disabled={isFinishing}>
                {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                {isFinishing ? "Finalizando..." : "Finalizar agora"}
              </Button>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </div>
  );
}

function AnswerButton({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string;
  icon: typeof Check;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-2 rounded-[var(--radius)] border px-4 py-3 text-sm font-semibold transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
