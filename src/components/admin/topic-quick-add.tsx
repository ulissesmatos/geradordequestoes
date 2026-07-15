"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { createTopicsBulkAction, type CreateTopicsBulkState } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";

/** Adição rápida de assuntos por matéria: aceita vários de uma vez (vírgula/linha). */
export function TopicQuickAdd({ subjectId }: { subjectId: string }) {
  const [state, formAction] = useActionState<CreateTopicsBulkState, FormData>(createTopicsBulkAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa o campo após criar, pronto para a próxima colagem.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.stamp, state?.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="flex items-start gap-2">
        <Textarea
          name="names"
          rows={1}
          required
          placeholder="Adicionar assuntos — separe vários por vírgula ou linha (ex.: Crase, Concordância, Regência)"
          className="min-h-10 flex-1 resize-y text-sm"
        />
        <SubmitButton variant="outline" size="sm" className="h-10 shrink-0">
          <Plus className="h-4 w-4" />
          Adicionar
        </SubmitButton>
      </div>
      {state?.ok && (
        <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 animate-fade-in">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.created === 1 ? "1 assunto criado" : `${state.created} assuntos criados`}
          {state.skipped ? ` · ${state.skipped} já existia(m)` : ""}
        </p>
      )}
      {state?.error && <p className="text-xs font-medium text-[var(--destructive)]">{state.error}</p>}
    </form>
  );
}
