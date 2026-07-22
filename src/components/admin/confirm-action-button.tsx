"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Botão de ação com confirmação em modal, para operações sensíveis do admin
 * (pausar/cancelar pacotes, etc.). Envia os `fields` como FormData da action.
 */
export function ConfirmActionButton({
  action,
  fields,
  confirmMessage,
  variant = "outline",
  children
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirmMessage: string;
  variant?: "outline" | "destructive" | "default";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      await action(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmar ação"
        description={confirmMessage}
        confirmLabel="Confirmar"
        onConfirm={handleConfirm}
        pending={pending}
        variant={variant === "outline" ? "default" : variant}
      />
    </>
  );
}
