"use client";

import { useState, useTransition } from "react";
import { QuestionSetShareVisibility } from "@prisma/client";
import { adminUpdateQuestionSetShareVisibilityAction } from "@/app/admin/admin-actions";

const LABELS: Record<QuestionSetShareVisibility, string> = {
  [QuestionSetShareVisibility.EVERYONE]: "Todos",
  [QuestionSetShareVisibility.LOGGED_IN]: "Só logados",
  [QuestionSetShareVisibility.PAID_ONLY]: "Só assinantes"
};

/** Select por linha da tabela /admin/compartilhamentos — muda a visibilidade de QUALQUER link, não só o do próprio admin. */
export function AdminShareVisibilitySelect({
  shareId,
  initialVisibility
}: {
  shareId: string;
  initialVisibility: QuestionSetShareVisibility;
}) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as QuestionSetShareVisibility;
    if (next === visibility) return;
    const previous = visibility;
    setVisibility(next);
    setError(null);
    startTransition(async () => {
      const result = await adminUpdateQuestionSetShareVisibilityAction(shareId, next);
      if (!result.ok) {
        setVisibility(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <select
        value={visibility}
        disabled={pending}
        onChange={handleChange}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-60"
      >
        {Object.entries(LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 max-w-40 text-xs text-[var(--danger-soft-foreground)]">{error}</p>}
    </div>
  );
}
