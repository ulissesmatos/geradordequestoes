import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Constância de estudo, calculada on-the-fly sobre QuestionAttempt (nada
 * materializado — sem bugs de invalidação; a janela é pequena, ≤ 365 dias,
 * e usa o índice [userId, createdAt]).
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
    SELECT DISTINCT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    ORDER BY day DESC
  `);
  const days = new Set(rows.map((row) => row.day));

  const dayKey = (offset: number) => {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  };

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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const answeredToday = await prisma.questionAttempt.count({
    where: { userId, createdAt: { gte: todayStart } }
  });
  return {
    goal,
    answeredToday,
    percent: goal ? Math.min(100, Math.round((answeredToday / goal) * 100)) : 0
  };
}
