"use client";

import { useState, useTransition } from "react";
import { deleteUserAction } from "@/app/admin/admin-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      await deleteUserAction(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
      >
        Excluir usuário
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Excluir "${userName}"?`}
        confirmLabel="Excluir usuário"
        onConfirm={handleConfirm}
        pending={pending}
      >
        <p>Isso irá:</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Cancelar assinaturas ativas</li>
          <li>Apagar logs de IA e histórico de chat</li>
          <li>Remover todas as questões, tentativas e dados do usuário</li>
        </ul>
        <p className="mt-3">Os logs de auditoria serão mantidos.</p>
        <p className="mt-2 font-semibold text-[var(--destructive)]">Esta ação é irreversível.</p>
      </ConfirmDialog>
    </>
  );
}
