"use client";

import { Trash2 } from "lucide-react";
import type { FormEvent } from "react";

export function ConfirmDeleteButton({
  action,
  id,
  label = "Excluir",
  confirmMessage = "Tem certeza? Esta ação não pode ser desfeita."
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label?: string;
  confirmMessage?: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirmMessage)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--destructive)] transition hover:bg-[var(--danger-soft)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}
