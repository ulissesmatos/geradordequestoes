import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKeyInBrazil, shiftDayKey, startOfDayInBrazil } from "@/lib/dates";
import { createdAtInBrazil } from "@/lib/dates-sql";

/**
 * Constância de estudo, calculada on-the-fly sobre QuestionAttempt (nada
 * materializado — sem bugs de invalidação; a janela é pequena, ≤ 365 dias,
 * e usa o índice [userId, createdAt]).
 *
 * O "dia" é sempre o dia do calendário brasileiro (ver src/lib/dates.ts): o SQL e
 * o JS precisam concordar, senão a sequência conta errado exatamente no horário em
 * que a maioria estuda (à noite).
 */

export type StreakInfo = {
  /** Dias consecutivos estudando, contando hoje se já estudou hoje, senão a partir de ontem. */
  current: number;
  /** Maior sequência dos últimos 365 dias. */
  best: number;
  /** true se já respondeu ao menos 1 questão hoje. */
  activeToday: boolean;
};

export async function getStreak(userId: string): Promise<StreakInfo> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ day: string }>>(Prisma.sql`
    SELECT DISTINCT to_char(date_trunc('day', ${createdAtInBrazil}), 'YYYY-MM-DD') AS day
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    ORDER BY day DESC
  `);
  const days = new Set(rows.map((row) => row.day));

  // Aritmética de calendário sobre a chave de hoje em Brasília — não sobre
  // "agora menos N × 24h", que erra na virada e discorda do agrupamento do SQL.
  const today = dayKeyInBrazil();
  const dayKey = (offset: number) => shiftDayKey(today, -offset);

  const activeToday = days.has(dayKey(0));

  // Streak atual: hoje (se estudou) ou ontem para trás — hoje ainda "em aberto" não zera.
  let current = 0;
  let offset = activeToday ? 0 : 1;
  while (days.has(dayKey(offset))) {
    current += 1;
    offset += 1;
  }

  // Recorde: varre os dias ordenados procurando a maior sequência consecutiva.
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    if (previous && isNextDay(previous, day)) run += 1;
    else run = 1;
    if (run > best) best = run;
    previous = day;
  }

  return { current, best: Math.max(best, current), activeToday };
}

function isNextDay(previous: string, day: string): boolean {
  const next = new Date(`${previous}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) === day;
}

export type DailyGoalProgress = {
  goal: number | null;
  answeredToday: number;
  percent: number;
};

export async function getDailyGoalProgress(userId: string, goal: number | null): Promise<DailyGoalProgress> {
  const answeredToday = await prisma.questionAttempt.count({
    where: { userId, createdAt: { gte: startOfDayInBrazil() } }
  });
  return {
    goal,
    answeredToday,
    percent: goal ? Math.min(100, Math.round((answeredToday / goal) * 100)) : 0
  };
}
