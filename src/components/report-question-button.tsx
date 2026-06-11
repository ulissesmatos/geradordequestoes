"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import { reportQuestionAction } from "@/app/(app)/actions/question-actions";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const FEEDBACK_TYPES: { value: string; label: string }[] = [
  { value: "GABARITO_ERRADO", label: "Gabarito errado" },
  { value: "ENUNCIADO_CONFUSO", label: "Enunciado confuso" },
  { value: "DESATUALIZADA", label: "Conteúdo desatualizado" },
  { value: "OUTRO", label: "Outro" }
];

export function ReportQuestionButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reportQuestionAction, null);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 1300);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Reportar problema nesta questão"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
      >
        <Flag className="h-3.5 w-3.5" />
        Reportar
      </button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel>
          <DialogHeader
            title="Reportar questão"
            description="Encontrou um erro ou algo estranho? Nos ajude a melhorar."
            onClose={() => setOpen(false)}
          />
          {state?.ok ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="font-semibold text-emerald-800">Obrigado pelo feedback!</p>
              <p className="text-sm text-[var(--muted-foreground)]">Nossa equipe vai revisar esta questão.</p>
            </div>
          ) : (
            <form action={formAction} className="space-y-4 px-6 py-5">
              <input type="hidden" name="questionId" value={questionId} />
              <label className="block space-y-1 text-sm font-medium">
                Tipo do problema
                <Select name="type" defaultValue="GABARITO_ERRADO">
                  {FEEDBACK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Detalhes <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
                <Textarea name="message" rows={3} maxLength={500} placeholder="Ex.: o gabarito deveria ser ERRADO porque..." />
              </label>
              {state?.error && (
                <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-70"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar feedback
              </button>
            </form>
          )}
        </DialogPanel>
      </Dialog>
    </>
  );
}
