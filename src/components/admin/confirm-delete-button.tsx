"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await action(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--destructive)] transition hover:bg-[var(--danger-soft)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {label}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmar exclusão"
        description={confirmMessage}
        confirmLabel="Excluir"
        onConfirm={handleConfirm}
        pending={pending}
      />
    </>
  );
}
