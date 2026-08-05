"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Globe, Lock, Users } from "lucide-react";
import { QuestionSetShareVisibility } from "@prisma/client";
import { updateQuestionSetShareVisibilityAction } from "@/app/(app)/actions/question-actions";
import { cn } from "@/lib/utils";

const OPTIONS: { value: QuestionSetShareVisibility; label: string; description: string; icon: typeof Globe }[] = [
  {
    value: QuestionSetShareVisibility.EVERYONE,
    label: "Todos",
    description: "Qualquer pessoa vê e responde — logada ou não, conta grátis ou paga. Sem restrição nenhuma.",
    icon: Globe
  },
  {
    value: QuestionSetShareVisibility.LOGGED_IN,
    label: "Só quem tem conta",
    description: "Exclui visitante sem conta (só vê a 1ª questão). Conta grátis ou paga responde o bloco inteiro.",
    icon: Users
  },
  {
    value: QuestionSetShareVisibility.PAID_ONLY,
    label: "Só assinantes",
    description: "Visitante sem conta responde só a 1ª questão; conta grátis responde as 5 primeiras. O resto pede assinatura.",
    icon: Lock
  }
];

/**
 * Só aparece pro dono do link quando ele é admin (checado pelo caller) — dono comum nunca vê
 * este controle, os links dele continuam sempre LOGGED_IN. Update é otimista: muda a seleção
 * na hora e reverte com uma mensagem de erro se o servidor recusar.
 */
export function QuestionSetShareVisibilityControl({
  questionSetId,
  initialVisibility
}: {
  questionSetId: string;
  initialVisibility: QuestionSetShareVisibility;
}) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: QuestionSetShareVisibility) {
    if (next === visibility) return;
    const previous = visibility;
    setVisibility(next);
    setError(null);
    startTransition(async () => {
      const result = await updateQuestionSetShareVisibilityAction(questionSetId, next);
      if (!result.ok) {
        setVisibility(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Quem pode ver e responder · link de admin
      </p>
      <div className="space-y-1.5" role="radiogroup" aria-label="Quem pode ver e responder este link">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors",
              visibility === option.value
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-[var(--border)] hover:bg-[var(--surface-subtle)]",
              pending && "opacity-70"
            )}
          >
            <input
              type="radio"
              name={`visibility-${questionSetId}`}
              value={option.value}
              checked={visibility === option.value}
              disabled={pending}
              onChange={() => handleChange(option.value)}
              className="sr-only"
            />
            <option.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
            <span>
              <span className="block font-medium text-[var(--foreground)]">{option.label}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-[var(--danger-soft-foreground)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
