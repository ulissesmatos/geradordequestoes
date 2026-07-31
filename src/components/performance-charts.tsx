import { dayKeyInBrazil, shiftDayKey } from "@/lib/dates";
import type { DailyActivityRow, SubjectBreakdownRow } from "@/lib/performance";

/**
 * Gráficos server-rendered do painel de desempenho — sem lib de charts e sem JS
 * no cliente. Par de cores validado para daltonismo (ΔE protan 10.3, contraste
 * ≥ 3:1 sobre superfície clara): acertos #0d9488 (teal) / erros #f43f5e (rose),
 * sempre com legenda e posição fixa na pilha como codificação secundária.
 */
const COLOR_CORRECT = "#0d9488";
const COLOR_WRONG = "#f43f5e";

export function StatTile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

/** Barras horizontais de % de acerto por disciplina — série única, rótulos diretos. */
export function SubjectAccuracyBars({ rows }: { rows: SubjectBreakdownRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const accuracy = row.total ? Math.round((row.correct / row.total) * 100) : 0;
        return (
          <div key={row.subjectId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{row.subjectName}</span>
              <span className="shrink-0 tabular-nums">
                <strong>{accuracy}%</strong>{" "}
                <span className="text-xs text-[var(--muted-foreground)]">
                  ({row.correct}/{row.total})
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${accuracy}%`, backgroundColor: COLOR_CORRECT }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Atividade dos últimos N dias: barras empilhadas por dia (acertos embaixo,
 * erros em cima — posição fixa), tooltip nativo via <title> e legenda.
 */
export function DailyActivityChart({ rows, days = 30 }: { rows: DailyActivityRow[]; days?: number }) {
  // Preenche dias sem atividade com zero para o eixo do tempo ser contínuo.
  // As chaves vêm agrupadas por dia do calendário brasileiro (getDailyActivity), então o
  // eixo tem que ser montado com a mesma régua — remontar com "agora menos N × 24h" em UTC
  // desalinhava as barras em uma casa durante as 3 primeiras horas de cada dia.
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series: Array<{ day: string; label: string; correct: number; wrong: number }> = [];
  const today = dayKeyInBrazil();
  for (let i = days - 1; i >= 0; i--) {
    const key = shiftDayKey(today, -i);
    const row = byDay.get(key);
    const total = row?.total ?? 0;
    const correct = row?.correct ?? 0;
    const [year, month, day] = key.split("-").map(Number);
    series.push({
      day: key,
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, day))
      ),
      correct,
      wrong: total - correct
    });
  }

  const max = Math.max(1, ...series.map((d) => d.correct + d.wrong));
  const chartHeight = 120;
  const barGap = 2;
  const barWidth = 10;
  const width = series.length * (barWidth + barGap);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Questões respondidas por dia nos últimos ${days} dias`}
      >
        {series.map((d, i) => {
          const total = d.correct + d.wrong;
          const x = i * (barWidth + barGap);
          const correctH = (d.correct / max) * (chartHeight - 4);
          const wrongH = (d.wrong / max) * (chartHeight - 4);
          return (
            <g key={d.day}>
              <title>{`${d.label}: ${total} ${total === 1 ? "questão" : "questões"} (${d.correct} certas, ${d.wrong} erradas)`}</title>
              {/* trilho sutil para dias vazios continuarem visíveis/hoveráveis */}
              <rect x={x} y={chartHeight - 2} width={barWidth} height={2} rx={1} fill="var(--muted)" />
              {d.correct > 0 && (
                <rect x={x} y={chartHeight - correctH} width={barWidth} height={correctH} rx={1.5} fill={COLOR_CORRECT} />
              )}
              {d.wrong > 0 && (
                <rect
                  x={x}
                  y={chartHeight - correctH - barGap - wrongH}
                  width={barWidth}
                  height={wrongH}
                  rx={1.5}
                  fill={COLOR_WRONG}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
        <span>{series[0]?.label}</span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_CORRECT }} />
            Acertos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_WRONG }} />
            Erros
          </span>
        </div>
        <span>{series[series.length - 1]?.label}</span>
      </div>
    </div>
  );
}
