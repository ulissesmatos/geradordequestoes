import { dayKeyInBrazil, shiftDayKey } from "@/lib/dates";
import type { DailyActivityRow } from "@/lib/performance";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Últimos 7 dias como quadradinhos preenchidos/vazios.
 *
 * É o visual que faz o hábito aparecer: ver dois buracos na semana comunica mais do que
 * qualquer número. Usa as MESMAS chaves de dia do resto do painel (calendário brasileiro),
 * senão a coluna de "hoje" apareceria vazia durante as primeiras horas do dia.
 */
export function WeekStrip({ rows }: { rows: DailyActivityRow[] }) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = dayKeyInBrazil();

  const days = Array.from({ length: 7 }, (_, index) => {
    const key = shiftDayKey(today, index - 6);
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return {
      key,
      total: byDay.get(key)?.total ?? 0,
      weekday: WEEKDAY_LABELS[date.getUTCDay()],
      dayOfMonth: date.getUTCDate(),
      isToday: key === today
    };
  });

  return (
    <div className="flex items-end justify-between gap-1.5">
      {days.map((day) => (
        <div key={day.key} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-medium uppercase text-[var(--muted-foreground)]">{day.weekday}</span>
          <div
            title={`${day.dayOfMonth}: ${day.total} ${day.total === 1 ? "questão" : "questões"}`}
            className={cn(
              "flex aspect-square w-full max-w-11 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition",
              day.total > 0
                ? "border-transparent bg-[var(--success)] text-white"
                : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]",
              // Hoje ganha anel mesmo estando vazio: é a casa que a pessoa ainda pode preencher.
              day.isToday && "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card)]"
            )}
          >
            {day.total > 0 ? day.total : day.dayOfMonth}
          </div>
        </div>
      ))}
    </div>
  );
}
