"use client";

import { useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateReferenceQuestionSubjectAction } from "@/app/admin/referencias/actions";
import { Select } from "@/components/ui/select";

/**
 * Correção manual da matéria de uma questão extraída. Salva no onChange (sem botão) porque
 * a revisão é feita em lote, questão por questão — um botão por linha atrapalharia mais que ajudaria.
 */
export function ReferenceSubjectSelect({
  questionId,
  documentId,
  subjectId,
  subjects
}: {
  questionId: string;
  documentId: string;
  subjectId: string | null;
  subjects: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateReferenceQuestionSubjectAction} className="flex items-center gap-1.5">
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="documentId" value={documentId} />
      <Select
        name="subjectId"
        defaultValue={subjectId ?? ""}
        aria-label="Matéria da questão"
        disabled={pending}
        className="h-7 w-auto max-w-[190px] px-2 py-0 text-xs"
        onChange={() => startTransition(() => formRef.current?.requestSubmit())}
      >
        <option value="">— sem matéria —</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </Select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" />}
    </form>
  );
}
