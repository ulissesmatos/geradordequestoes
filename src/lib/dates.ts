/**
 * Fronteiras de "dia" e "mês" no fuso do aluno.
 *
 * Por que existe: o Postgres roda em UTC e o Prisma grava `DateTime` como
 * `timestamp without time zone` já convertido para UTC. Sem tradução, todo corte
 * diário do app (streak, meta do dia, cota diária, limite do banco de questões)
 * virava às 21h de Brasília — quem estudava das 20h às 22h contava como DOIS dias
 * de sequência, e a meta diária zerava no meio da sessão de estudo.
 *
 * Tudo aqui usa `Intl` com o nome do fuso em vez de somar -3h fixo: se o horário
 * de verão voltar, a conversão continua certa sem ninguém lembrar de mexer.
 *
 * Este arquivo é deliberadamente puro (sem Prisma, sem acesso a banco) porque é
 * importado também por componentes client. O equivalente em SQL mora em
 * `src/lib/dates-sql.ts`.
 */

export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BRAZIL_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** Data do calendário brasileiro no formato "YYYY-MM-DD" (en-CA já formata assim). */
export function dayKeyInBrazil(reference: Date = new Date()): string {
  return dayKeyFormatter.format(reference);
}

/** Offset do fuso em minutos no instante dado (-180 no horário padrão de Brasília). */
function zoneOffsetMinutes(instant: Date): number {
  const parts = partsFormatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    // "24" aparece em algumas implementações no lugar de "00" em hour12: false.
    value("hour") % 24,
    value("minute"),
    value("second")
  );
  // Descarta os milissegundos do instante: `localAsUtc` não os tem, e offsets de
  // fuso são sempre minutos inteiros.
  return Math.round((localAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Converte uma data local de Brasília (ano/mês/dia à meia-noite) no instante UTC correspondente. */
function brazilMidnightToInstant(year: number, month: number, day: number): Date {
  // O offset é medido ao meio-dia local para nunca cair na hora que não existe (ou
  // que existe duas vezes) numa eventual virada de horário de verão.
  const noonGuess = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = zoneOffsetMinutes(noonGuess);
  return new Date(Date.UTC(year, month - 1, day) - offset * 60_000);
}

function splitDayKey(key: string): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number);
  return [year, month, day];
}

/** Instante da meia-noite de hoje em Brasília. Substitui `setHours(0,0,0,0)`. */
export function startOfDayInBrazil(reference: Date = new Date()): Date {
  const [year, month, day] = splitDayKey(dayKeyInBrazil(reference));
  return brazilMidnightToInstant(year, month, day);
}

/** Instante da próxima meia-noite em Brasília — quando a cota diária reseta. */
export function startOfNextDayInBrazil(reference: Date = new Date()): Date {
  const [year, month, day] = splitDayKey(dayKeyInBrazil(reference));
  return brazilMidnightToInstant(year, month, day + 1);
}

/** Instante do primeiro dia do mês corrente em Brasília. */
export function startOfMonthInBrazil(reference: Date = new Date()): Date {
  const [year, month] = splitDayKey(dayKeyInBrazil(reference));
  return brazilMidnightToInstant(year, month, 1);
}

/** Instante do primeiro dia do mês seguinte em Brasília — quando a cota mensal reseta. */
export function startOfNextMonthInBrazil(reference: Date = new Date()): Date {
  const [year, month] = splitDayKey(dayKeyInBrazil(reference));
  return brazilMidnightToInstant(year, month + 1, 1);
}

/** Soma dias a uma chave "YYYY-MM-DD", devolvendo outra chave. Aritmética de calendário puro. */
export function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = splitDayKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Instante da meia-noite de uma chave "YYYY-MM-DD" interpretada em Brasília. */
export function dayKeyToInstant(key: string): Date {
  const [year, month, day] = splitDayKey(key);
  return brazilMidnightToInstant(year, month, day);
}

/** Dia da semana em Brasília: 0 = domingo, 6 = sábado. */
export function weekdayInBrazil(reference: Date = new Date()): number {
  const [year, month, day] = splitDayKey(dayKeyInBrazil(reference));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Instante da segunda-feira 0h da semana corrente em Brasília.
 *
 * Volta pela chave de calendário em vez de subtrair N × 24h do instante: se o
 * horário de verão voltar, uma das semanas teria 167h e a janela sairia torta.
 */
export function startOfWeekInBrazil(reference: Date = new Date()): Date {
  const today = dayKeyInBrazil(reference);
  const daysSinceMonday = (weekdayInBrazil(reference) + 6) % 7;
  return dayKeyToInstant(shiftDayKey(today, -daysSinceMonday));
}

/**
 * Exibição de datas pro usuário — sempre no fuso de Brasília, não importa se o
 * processo (server component, action, cron, e-mail) roda em UTC. Todo `new
 * Date`/Prisma `DateTime` já é um instante absoluto; a conversão pro fuso do
 * aluno é só na hora de formatar, nunca ao salvar (banco continua 100% UTC).
 *
 * Antes disso, ~15 arquivos definiam sua própria função `formatDate` local com
 * `Intl.DateTimeFormat("pt-BR", {...})` sem `timeZone` — cada um herdava o fuso
 * do processo Node, então em produção (servidor em UTC) uma resposta às 21h30
 * de Brasília aparecia com a data de amanhã e "00:30" pra quem via renderizado
 * no servidor.
 */
type DateInput = Date | string | number;

function brazilFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: BRAZIL_TIME_ZONE });
}

/** Só a data ("short" → "02/08/2026", "medium" → "2 de ago. de 2026", "long" → "2 de agosto de 2026"). */
export function formatDateBR(date: DateInput | null | undefined, dateStyle: "short" | "medium" | "long" = "short"): string {
  if (date == null) return "—";
  return brazilFormatter({ dateStyle }).format(new Date(date));
}

/** Data + hora curta, ex. "02/08/2026 14:30". */
export function formatDateTimeBR(date: DateInput | null | undefined, dateStyle: "short" | "medium" | "long" = "short"): string {
  if (date == null) return "—";
  return brazilFormatter({ dateStyle, timeStyle: "short" }).format(new Date(date));
}

/** Dia e mês compactos, sem ano — ex. prazo de revisão "02/08". */
export function formatDayMonthBR(date: DateInput | null | undefined): string {
  if (date == null) return "—";
  return brazilFormatter({ day: "2-digit", month: "2-digit" }).format(new Date(date));
}
