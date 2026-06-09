"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Heart, X } from "lucide-react";
import { answerQuestionAction, toggleFavoriteAction } from "@/app/(app)/study-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  format?: "CERTO_ERRADO" | "MULTIPLA_ESCOLHA";
  answer?: "CERTO" | "ERRADO" | null;
  explanation: string;
  subject: { name: string };
  topic: { name: string };
  options?: RunnerOption[];
};

type SelectedAnswer = {
  label: string;
  value: string;
  isCorrect: boolean;
};

export function QuestionRunner({ questions, mode }: { questions: RunnerQuestion[]; mode: "study" | "simulado" }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SelectedAnswer>>({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const [finished, setFinished] = useState(false);
  const current = questions[index];

  const score = useMemo(
    () => questions.filter((question) => answers[question.id]?.isCorrect).length,
    [answers, questions]
  );

  if (questions.length === 0) {
    return <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Nenhuma questão encontrada para este bloco.</p>;
  }

  if (finished) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resultado: {score} de {questions.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map((question, questionIndex) => {
            const selected = answers[question.id];
            const correct = getCorrectLabel(question);
            return (
              <div key={question.id} className="rounded-md border border-[var(--border)] p-4">
                <p className="text-sm font-semibold">Questão {questionIndex + 1}</p>
                <p className="mt-2">{question.statement}</p>
                <p className={selected?.isCorrect ? "mt-2 font-semibold text-emerald-800" : "mt-2 font-semibold text-rose-800"}>
                  Sua resposta: {selected?.label ?? "sem resposta"} / Gabarito: {correct}
                </p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{question.explanation}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  const selected = answers[current.id];
  const showFeedback = mode === "study" && selected;
  const options = getRenderableOptions(current);

  function submit(payload: { label: string; value: string; isCorrect: boolean; userAnswer?: "CERTO" | "ERRADO"; optionId?: string }) {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setAnswers((previous) => ({
      ...previous,
      [current.id]: { label: payload.label, value: payload.value, isCorrect: payload.isCorrect }
    }));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("questionId", current.id);
      if (payload.userAnswer) formData.set("userAnswer", payload.userAnswer);
      if (payload.optionId) formData.set("selectedOptionId", payload.optionId);
      formData.set("userAnswerText", payload.label);
      formData.set("timeSpentSeconds", String(elapsed));
      await answerQuestionAction(formData);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Questão {index + 1} de {questions.length}</CardTitle>
          <form action={toggleFavoriteAction}>
            <input type="hidden" name="questionId" value={current.id} />
            <Button variant="ghost" size="icon" title="Favoritar">
              <Heart className="h-5 w-5" />
            </Button>
          </form>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          {current.subject.name} / {current.topic.name} / {current.format === "MULTIPLA_ESCOLHA" ? "Múltipla escolha" : "Certo/Errado"}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-lg leading-8">{current.statement}</p>
        <div className="grid gap-3">
          {options.map((option) => (
            <Button
              key={option.key}
              disabled={Boolean(selected) || isPending}
              size="lg"
              variant="outline"
              className="h-auto justify-start whitespace-normal py-4 text-left"
              onClick={() => submit(option)}
            >
              {option.icon}
              <span className="font-bold">{option.label}</span>
              <span>{option.value}</span>
            </Button>
          ))}
        </div>
        {showFeedback && (
          <div className={selected.isCorrect ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" : "rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-900"}>
            <p className="font-semibold">{selected.isCorrect ? "Resposta correta" : `Resposta incorreta. Gabarito: ${getCorrectLabel(current)}`}</p>
            <p className="mt-2 text-sm">{current.explanation}</p>
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

function getCorrectLabel(question: RunnerQuestion) {
  const correct = question.options?.find((option) => option.isCorrect);
  if (correct) return `${correct.label}) ${correct.text}`;
  return question.answer ?? "sem gabarito";
}
