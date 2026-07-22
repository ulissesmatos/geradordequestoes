import { Prisma, QuestionStatus, type QuestionReviewState } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Revisão espaçada determinística (sem IA): quem errou revê no dia seguinte;
 * quem acertou revê em intervalos crescentes até o teto de 35 dias.
 * Uma linha de QuestionReviewState por usuário+questão, atualizada em TODA
 * tentativa (estudo, prática e simulado).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Intervalos após acertos consecutivos: 1º acerto → 3d, 2º → 7d, 3º → 16d, 4º+ → 35d. */
export const REVIEW_INTERVALS_DAYS = [3, 7, 16, 35] as const;

/** Máximo de questões por sessão de revisão. */
export const REVIEW_SESSION_LIMIT = 20;

type NextState = {
  correctStreak: number;
  lapsesDelta: number;
  dueAt: Date;
};

export function computeNextReviewState(
  previous: Pick<QuestionReviewState, "correctStreak"> | null,
  isCorrect: boolean,
  at: Date
): NextState {
  if (!isCorrect) {
    return { correctStreak: 0, lapsesDelta: previous ? 1 : 0, dueAt: new Date(at.getTime() + DAY_MS) };
  }
  const streak = (previous?.correctStreak ?? 0) + 1;
  const intervalDays = REVIEW_INTERVALS_DAYS[Math.min(streak, REVIEW_INTERVALS_DAYS.length) - 1];
  return { correctStreak: streak, lapsesDelta: 0, dueAt: new Date(at.getTime() + intervalDays * DAY_MS) };
}

/** Atualiza (upsert) o estado de revisão após uma tentativa. Nunca lança — revisão não pode quebrar o fluxo de resposta. */
export async function applyAttemptToReviewState(input: {
  userId: string;
  questionId: string;
  isCorrect: boolean;
  at?: Date;
}): Promise<void> {
  const at = input.at ?? new Date();
  try {
    const previous = await prisma.questionReviewState.findUnique({
      where: { userId_questionId: { userId: input.userId, questionId: input.questionId } },
      select: { correctStreak: true }
    });
    const next = computeNextReviewState(previous, input.isCorrect, at);
    await prisma.questionReviewState.upsert({
      where: { userId_questionId: { userId: input.userId, questionId: input.questionId } },
      update: {
        correctStreak: next.correctStreak,
        lapses: { increment: next.lapsesDelta },
        lastIsCorrect: input.isCorrect,
        lastAttemptAt: at,
        dueAt: next.dueAt
      },
      create: {
        userId: input.userId,
        questionId: input.questionId,
        correctStreak: next.correctStreak,
        lapses: 0,
        lastIsCorrect: input.isCorrect,
        lastAttemptAt: at,
        dueAt: next.dueAt
      }
    });
  } catch {
    // melhor perder uma atualização de agenda do que falhar a resposta do aluno
  }
}

/** Versão em lote (simulado finalizado): 1 busca + upserts em transação. */
export async function applyAttemptsToReviewStates(
  userId: string,
  attempts: Array<{ questionId: string; isCorrect: boolean }>,
  at: Date = new Date()
): Promise<void> {
  if (attempts.length === 0) return;
  try {
    const existing = await prisma.questionReviewState.findMany({
      where: { userId, questionId: { in: attempts.map((a) => a.questionId) } },
      select: { questionId: true, correctStreak: true }
    });
    const byQuestion = new Map(existing.map((s) => [s.questionId, s]));

    await prisma.$transaction(
      attempts.map((attempt) => {
        const previous = byQuestion.get(attempt.questionId) ?? null;
        const next = computeNextReviewState(previous, attempt.isCorrect, at);
        return prisma.questionReviewState.upsert({
          where: { userId_questionId: { userId, questionId: attempt.questionId } },
          update: {
            correctStreak: next.correctStreak,
            lapses: { increment: next.lapsesDelta },
            lastIsCorrect: attempt.isCorrect,
            lastAttemptAt: at,
            dueAt: next.dueAt
          },
          create: {
            userId,
            questionId: attempt.questionId,
            correctStreak: next.correctStreak,
            lapses: 0,
            lastIsCorrect: attempt.isCorrect,
            lastAttemptAt: at,
            dueAt: next.dueAt
          }
        });
      })
    );
  } catch {
    // idem: agenda é best-effort
  }
}

/**
 * Backfill preguiçoso para usuários com tentativas anteriores à feature:
 * cria estados a partir da ÚLTIMA tentativa de cada questão. Idempotente
 * (só roda quando não existe nenhum estado).
 */
export async function ensureReviewBackfill(userId: string): Promise<void> {
  const hasStates = await prisma.questionReviewState.count({ where: { userId }, take: 1 });
  if (hasStates > 0) return;
  const hasAttempts = await prisma.questionAttempt.count({ where: { userId }, take: 1 });
  if (hasAttempts === 0) return;

  const latest = await prisma.$queryRaw<
    Array<{ questionId: string; isCorrect: boolean; createdAt: Date }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("questionId") "questionId", "isCorrect", "createdAt"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
    ORDER BY "questionId", "createdAt" DESC
  `);

  const now = new Date();
  await prisma.questionReviewState.createMany({
    data: latest.map((attempt) => {
      const next = computeNextReviewState(null, attempt.isCorrect, attempt.createdAt);
      return {
        userId,
        questionId: attempt.questionId,
        correctStreak: next.correctStreak,
        lapses: 0,
        lastIsCorrect: attempt.isCorrect,
        lastAttemptAt: attempt.createdAt,
        // errada → já vencida (revisa hoje); certa → conta a partir da tentativa
        dueAt: attempt.isCorrect ? next.dueAt : now
      };
    }),
    skipDuplicates: true
  });
}

/** Filtro de questões que o usuário pode responder (mesma regra de answerQuestionAction). */
function answerableQuestionWhere(userId: string) {
  return { OR: [{ status: QuestionStatus.APPROVED }, { createdById: userId }] };
}

export async function countDueReviews(userId: string): Promise<number> {
  return prisma.questionReviewState.count({
    where: { userId, dueAt: { lte: new Date() }, question: answerableQuestionWhere(userId) }
  });
}

export type DueReviewSummary = {
  total: number;
  bySubject: Array<{ subjectId: string; subjectName: string; count: number }>;
};

export async function getDueReviewSummary(userId: string): Promise<DueReviewSummary> {
  const due = await prisma.questionReviewState.findMany({
    where: { userId, dueAt: { lte: new Date() }, question: answerableQuestionWhere(userId) },
    select: { question: { select: { subjectId: true, subject: { select: { name: true } } } } }
  });
  const bySubject = new Map<string, { subjectId: string; subjectName: string; count: number }>();
  for (const state of due) {
    const key = state.question.subjectId;
    const entry = bySubject.get(key) ?? { subjectId: key, subjectName: state.question.subject.name, count: 0 };
    entry.count += 1;
    bySubject.set(key, entry);
  }
  return {
    total: due.length,
    bySubject: [...bySubject.values()].sort((a, b) => b.count - a.count)
  };
}

/** Questões vencidas prontas para o QuestionRunner (mais atrasadas primeiro). */
export async function getDueReviewQuestions(userId: string, limit = REVIEW_SESSION_LIMIT) {
  const states = await prisma.questionReviewState.findMany({
    where: { userId, dueAt: { lte: new Date() }, question: answerableQuestionWhere(userId) },
    orderBy: { dueAt: "asc" },
    take: limit,
    include: {
      question: {
        include: {
          subject: true,
          topic: true,
          options: { orderBy: { order: "asc" } }
        }
      }
    }
  });
  return states.map((state) => state.question);
}
