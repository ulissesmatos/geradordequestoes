import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selo "revisada por humano" — mostrado onde a questão aparece para o aluno (lista do banco, runner). */
export function ReviewedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--success-soft-foreground)]",
        className
      )}
    >
      <ShieldCheck className="h-3 w-3 shrink-0" />
      Revisada pela equipe
    </span>
  );
}
