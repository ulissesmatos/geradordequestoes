"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";

/**
 * Modal de confirmação reutilizável — substitui window.confirm() em toda a
 * base. `children` aceita conteúdo rico (listas, texto formatado) quando uma
 * simples `description` de uma linha não é suficiente.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  pending = false,
  variant = "destructive"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  variant?: ButtonProps["variant"];
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogPanel>
        <DialogHeader title={title} description={description} onClose={onClose} />
        {children && <div className="px-6 py-4 text-sm text-[var(--muted-foreground)]">{children}</div>}
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "Processando..." : confirmLabel}
          </Button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
