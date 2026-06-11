import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border border-amber-200",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-soft-foreground)]",
  info: "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
};

/** Badge de status padronizado para o admin (assinaturas, transações, materiais, etc.). */
export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Mapeia status comuns de assinatura/pagamento para um tom de cor. */
export function statusTone(status: string): Tone {
  const s = status.toUpperCase();
  if (["ACTIVE", "APPROVED", "COMPLETED", "PAID", "READY"].includes(s)) return "success";
  if (["PENDING", "PROCESSING", "PAST_DUE", "PENDING_REVIEW", "DRAFT"].includes(s)) return "warning";
  if (["CANCELED", "EXPIRED", "REJECTED", "ERROR", "REVOKED", "REFUNDED"].includes(s)) return "danger";
  return "neutral";
}
