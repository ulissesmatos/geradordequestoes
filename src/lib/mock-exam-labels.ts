import { MockExamStatus } from "@prisma/client";

export const mockExamStatusMeta: Record<MockExamStatus, { label: string; className: string }> = {
  [MockExamStatus.DRAFT]: { label: "Rascunho", className: "bg-amber-100 text-amber-800" },
  [MockExamStatus.PUBLISHED]: { label: "Publicado", className: "bg-emerald-100 text-emerald-800" },
  [MockExamStatus.CLOSED]: { label: "Fechado", className: "bg-[var(--muted)] text-[var(--muted-foreground)]" },
  [MockExamStatus.ARCHIVED]: { label: "Arquivado", className: "bg-rose-100 text-rose-800" }
};
