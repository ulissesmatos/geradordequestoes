"use client";

import { useTransition } from "react";
import { deleteUserAction } from "@/app/admin/admin-actions";

export function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = window.confirm(
      `Excluir "${userName}"?\n\nIsso irá:\n• Cancelar assinaturas ativas\n• Apagar logs de IA e histórico de chat\n• Remover todas as questões, tentativas e dados do usuário\n\nOs logs de auditoria serão mantidos.\n\nEsta ação é irreversível.`
    );
    if (!confirmed) return;
    startTransition(async () => {
      const formData = new FormData(event.currentTarget);
      await deleteUserAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
      >
        {pending ? "Excluindo…" : "Excluir usuário"}
      </button>
    </form>
  );
}
