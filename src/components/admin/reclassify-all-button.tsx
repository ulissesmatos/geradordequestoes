"use client";

import { useActionState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { reclassifyReferenceQuestionsAction, type ReclassifyResult } from "@/app/admin/referencias/actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * Reclassifica TODAS as questões extraídas que estão sem matéria, em todos os materiais,
 * usando o palpite que a IA já gravou na extração. Não chama IA — é de graça e idempotente.
 */
export function ReclassifyAllButton({ pending }: { pending: number }) {
  const [state, formAction] = useActionState<ReclassifyResult | null, FormData>(
    async (_prev, formData) => reclassifyReferenceQuestionsAction(formData),
    null
  );

  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-soft)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--warning-soft-foreground)]">
          <strong>{pending}</strong> {pending === 1 ? "questão extraída está" : "questões extraídas estão"} sem matéria. Sem
          matéria, a geração de questões não consegue priorizar o material certo por assunto.
        </div>
        <form action={formAction}>
          <SubmitButton variant="outline" size="sm">
            <Sparkles className="h-3.5 w-3.5" />
            Reclassificar todas pelo palpite da IA
          </SubmitButton>
        </form>
      </div>
      {state && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 animate-fade-in">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.classified} de {state.scanned} classificadas
          {state.unresolved > 0 ? ` · ${state.unresolved} precisam de ajuste manual` : ""}
          {state.createdSubjects.length ? ` · matérias criadas: ${state.createdSubjects.join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}
