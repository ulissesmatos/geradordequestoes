import { cn } from "@/lib/utils";

/**
 * Barra e anel de progresso do painel.
 *
 * Existem porque a mesma barra estava reescrita à mão em quatro telas (meta diária, acerto
 * por matéria, uso de IA do assinante e cota do trial), cada uma com um arredondamento e uma
 * regra de cor ligeiramente diferente. Server-rendered, sem JS no cliente — mesma escolha dos
 * gráficos em performance-charts.tsx.
 */

export type ProgressTone = "primary" | "success" | "warning" | "danger";

const BAR_TONES: Record<ProgressTone, string> = {
  primary: "bg-[var(--primary)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--destructive)]"
};

const RING_TONES: Record<ProgressTone, string> = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)"
};

function clampPercent(value: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

/**
 * Escolhe o tom pela proximidade do teto. Verde só ao COMPLETAR uma meta (progresso bom);
 * para cota, encher a barra é ruim, então a escala vai de neutro a vermelho.
 */
export function quotaTone(percent: number): ProgressTone {
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warning";
  return "primary";
}

export function Progress({
  value,
  total,
  tone = "primary",
  className,
  label
}: {
  value: number;
  total: number;
  tone?: ProgressTone;
  className?: string;
  /** Descrição para leitor de tela — a barra sozinha não comunica nada. */
  label: string;
}) {
  const percent = clampPercent(value, total);
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]", className)}
    >
      <div className={cn("h-full rounded-full transition-all", BAR_TONES[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Anel de progresso da meta diária. SVG puro: o traço é desenhado com `stroke-dasharray`,
 * sem lib de gráfico e sem JS.
 */
export function ProgressRing({
  value,
  total,
  tone = "primary",
  size = 96,
  strokeWidth = 8,
  label,
  children
}: {
  value: number;
  total: number;
  tone?: ProgressTone;
  size?: number;
  strokeWidth?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const percent = clampPercent(value, total);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={label}
        // Gira para o traço começar no topo em vez de às 3 horas.
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_TONES[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
}
