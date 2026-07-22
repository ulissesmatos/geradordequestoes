import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Agregações de desempenho para o painel /desempenho, em SQL sobre TODO o
 * histórico de tentativas (as funções de src/lib/ai/study-tools.ts usam janelas
 * pequenas em memória por serem contexto de IA — não confundir os dois usos).
 */

export type PerformanceSummary = {
  total: number;
  correct: number;
  accuracy: number; // 0-100
  avgSeconds: number;
  last7Total: number;
  last7Correct: number;
};

export async function getPerformanceSummary(userId: string): Promise<PerformanceSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ total: number; correct: number; avgseconds: number | null; last7total: number; last7correct: number }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "isCorrect")::int AS correct,
      AVG("timeSpentSeconds") AS avgseconds,
      COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo})::int AS last7total,
      COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo} AND "isCorrect")::int AS last7correct
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
  `);
  const row = rows[0];
  const total = row?.total ?? 0;
  const correct = row?.correct ?? 0;
  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    avgSeconds: Math.round(Number(row?.avgseconds ?? 0)),
    last7Total: row?.last7total ?? 0,
    last7Correct: row?.last7correct ?? 0
  };
}

export type SubjectBreakdownRow = {
  subjectId: string;
  subjectName: string;
  total: number;
  correct: number;
};

export async function getSubjectBreakdown(userId: string): Promise<SubjectBreakdownRow[]> {
  return prisma.$queryRaw<SubjectBreakdownRow[]>(Prisma.sql`
    SELECT
      s.id AS "subjectId",
      s.name AS "subjectName",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a."isCorrect")::int AS correct
    FROM "QuestionAttempt" a
    JOIN "Question" q ON q.id = a."questionId"
    JOIN "Subject" s ON s.id = q."subjectId"
    WHERE a."userId" = ${userId}
    GROUP BY s.id, s.name
    ORDER BY COUNT(*) DESC
  `);
}

export type DailyActivityRow = {
  day: string; // YYYY-MM-DD
  total: number;
  correct: number;
};

export async function getDailyActivity(userId: string, days = 30): Promise<DailyActivityRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.$queryRaw<DailyActivityRow[]>(Prisma.sql`
    SELECT
      to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "isCorrect")::int AS correct
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export type WorstTopicRow = {
  topicId: string;
  subjectId: string;
  topicName: string;
  subjectName: string;
  total: number;
  correct: number;
};

/** Tópicos com pior taxa de acerto (mínimo de tentativas para evitar ruído de amostra pequena). */
export async function getWorstTopics(
  userId: string,
  options: { minAttempts?: number; limit?: number } = {}
): Promise<WorstTopicRow[]> {
  const minAttempts = options.minAttempts ?? 5;
  const limit = options.limit ?? 5;
  return prisma.$queryRaw<WorstTopicRow[]>(Prisma.sql`
    SELECT
      t.id AS "topicId",
      s.id AS "subjectId",
      t.name AS "topicName",
      s.name AS "subjectName",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a."isCorrect")::int AS correct
    FROM "QuestionAttempt" a
    JOIN "Question" q ON q.id = a."questionId"
    JOIN "Topic" t ON t.id = q."topicId"
    JOIN "Subject" s ON s.id = q."subjectId"
    WHERE a."userId" = ${userId}
    GROUP BY t.id, s.id, t.name, s.name
    HAVING COUNT(*) >= ${minAttempts}
    ORDER BY (COUNT(*) FILTER (WHERE a."isCorrect"))::float / COUNT(*) ASC, COUNT(*) DESC
    LIMIT ${limit}
  `);
}

export async function getRecentMockExamResults(userId: string) {
  return prisma.mockExamSession.findMany({
    where: { userId, finishedAt: { not: null } },
    include: { mockExam: { select: { title: true } } },
    orderBy: { finishedAt: "desc" },
    take: 5
  });
}
