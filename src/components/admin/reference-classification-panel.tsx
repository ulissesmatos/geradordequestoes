"use client";

import { useActionState } from "react";
import { CheckCircle2, Sparkles, Tags } from "lucide-react";
import { bulkAssignSubjectAction, reclassifyReferenceQuestionsAction, type ReclassifyResult } from "@/app/admin/referencias/actions";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { Select } from "@/components/ui/select";

type Distribution = { name: string; count: number }[];

/**
 * Painel de classificação por matéria de um material. Mostra a distribuição real das questões
 * extraídas e oferece as duas formas de resolver as que ficaram sem matéria: reclassificar pelo
 * palpite que a IA já gravou (grátis, sem chamar IA) ou aplicar uma matéria em massa.
 */
export function ReferenceClassificationPanel({
  documentId,
  distribution,
  unclassified,
  subjects
}: {
  documentId: string;
  distribution: Distribution;
  unclassified: number;
  subjects: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<ReclassifyResult | null, FormData>(
    async (_prev, formData) => reclassifyReferenceQuestionsAction(formData),
    null
  );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        <Tags className="h-3.5 w-3.5" />
        Classificação por matéria
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {distribution.length === 0 && unclassified === 0 && (
          <span className="text-sm text-[var(--muted-foreground)]">Nenhuma questão extraída ainda.</span>
        )}
        {distribution.map((item) => (
          <StatusBadge key={item.name} tone="info">
            {item.name} · {item.count}
          </StatusBadge>
        ))}
        {unclassified > 0 && <StatusBadge tone="warning">{unclassified} sem matéria</StatusBadge>}
      </div>

      {unclassified > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <form action={formAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <SubmitButton variant="outline" size="sm">
              <Sparkles className="h-3.5 w-3.5" />
              Reclassificar pelo palpite da IA
            </SubmitButton>
          </form>

          <form action={bulkAssignSubjectAction} className="flex items-end gap-2">
            <input type="hidden" name="documentId" value={documentId} />
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
              Ou aplicar a todas as {unclassified} sem matéria
              <Select name="subjectId" required defaultValue="" className="h-8 w-auto min-w-[180px] px-2 py-0 text-xs">
                <option value="" disabled>
                  Escolher matéria…
                </option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </label>
            <SubmitButton variant="outline" size="sm">
              Aplicar
            </SubmitButton>
          </form>
        </div>
      )}

      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        A reclassificação usa a matéria que a IA já identificou por questão na extração — não gasta nova chamada de IA.
        Matéria que ainda não existir no catálogo é criada automaticamente.
      </p>

      {state && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 animate-fade-in">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.classified} de {state.scanned} classificadas
          {state.unresolved > 0 ? ` · ${state.unresolved} sem palpite utilizável (ajuste manual)` : ""}
          {state.createdSubjects.length ? ` · matérias criadas: ${state.createdSubjects.join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}
