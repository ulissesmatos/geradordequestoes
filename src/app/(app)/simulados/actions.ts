"use server";

import { MockExamStatus, Prisma, QuestionAnswer } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/guards";
import {
  computeExpiresAt,
  ensureSessionCurrent,
  finalizeMockExamSession,
  getExamWindowState,
  getStudentTeamAccountId
} from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

/** Valida se o aluno pode ver/iniciar este simulado (publicado + janela + team). */
async function assertExamEligible(userId: string, mockExamId: string) {
  const exam = await prisma.mockExam.findUnique({ where: { id: mockExamId } });
  if (!exam || exam.status === MockExamStatus.DRAFT || exam.status === MockExamStatus.ARCHIVED) {
    throw new Error("Simulado não encontrado.");
  }
  if (exam.teamAccountId) {
    const teamId = await getStudentTeamAccountId(userId);
    if (teamId !== exam.teamAccountId) throw new Error("Simulado não disponível para sua conta.");
  }
  return exam;
}

export async function startMockExamAction(mockExamId: string) {
  const user = await requireUser();
  await requireActiveSubscription(user);

  const exam = await assertExamEligible(user.id, mockExamId);
  if (exam.status !== MockExamStatus.PUBLISHED) throw new Error("Este simulado não está aberto.");
  const windowState = getExamWindowState(exam);
  if (windowState === "futuro") throw new Error("Este simulado ainda não abriu.");
  if (windowState === "encerrado") throw new Error("Este simulado já encerrou.");

  // Sem unique(mockExamId, userId) no schema, dá pra ter mais de uma sessão: a 1ª (oficial)
  // conta pro comparativo com a turma, as seguintes nascem isPractice — mesmo layout
  // cronometrado, mas fora do ranking (ver MockExamSession.isPractice no schema).
  const existing = await prisma.mockExamSession.findMany({
    where: { mockExamId: exam.id, userId: user.id },
    select: { id: true, finishedAt: true, isPractice: true }
  });
  const active = existing.find((session) => !session.finishedAt);
  if (!active) {
    const hasOfficialAttempt = existing.some((session) => !session.isPractice);
    try {
      await prisma.mockExamSession.create({
        data: {
          mockExamId: exam.id,
          userId: user.id,
          expiresAt: computeExpiresAt(exam),
          isPractice: hasOfficialAttempt
        }
      });
    } catch (error) {
      // Corrida rara (duplo clique): segue para a sessão que já existir, sem tentar de novo.
      const isKnownError = error instanceof Prisma.PrismaClientKnownRequestError;
      if (!isKnownError) throw error;
    }
  }

  redirect(`/simulados/${exam.id}`);
}

const saveAnswerSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  userAnswer: z.nativeEnum(QuestionAnswer).nullable()
});

export type SaveAnswerResult = { ok: true } | { ok: false; expired?: boolean; error?: string };

export async function saveMockExamAnswerAction(input: {
  sessionId: string;
  questionId: string;
  userAnswer: "CERTO" | "ERRADO" | null;
}): Promise<SaveAnswerResult> {
  const user = await requireUser();
  const parsed = saveAnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Resposta inválida." };

  const session = await prisma.mockExamSession.findFirst({
    where: { id: parsed.data.sessionId, userId: user.id },
    select: {
      id: true,
      finishedAt: true,
      expiresAt: true,
      mockExam: { select: { questionSet: { select: { questions: { select: { id: true } } } } } }
    }
  });
  if (!session) return { ok: false, error: "Sessão não encontrada." };
  if (session.finishedAt) return { ok: false, expired: true };

  // Fonte de verdade do tempo é o servidor: expirou → finaliza e recusa.
  if (new Date() > session.expiresAt) {
    await finalizeMockExamSession(session.id);
    return { ok: false, expired: true };
  }

  const belongs = session.mockExam.questionSet.questions.some((q) => q.id === parsed.data.questionId);
  if (!belongs) return { ok: false, error: "Questão não pertence a este simulado." };

  await prisma.mockExamAnswer.upsert({
    where: { sessionId_questionId: { sessionId: session.id, questionId: parsed.data.questionId } },
    create: { sessionId: session.id, questionId: parsed.data.questionId, userAnswer: parsed.data.userAnswer },
    update: { userAnswer: parsed.data.userAnswer }
  });

  return { ok: true };
}

export async function finishMockExamAction(sessionId: string) {
  const user = await requireUser();
  const session = await prisma.mockExamSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, finishedAt: true, expiresAt: true, mockExamId: true }
  });
  if (!session) throw new Error("Sessão não encontrada.");

  const alreadyDone = await ensureSessionCurrent(session);
  if (!alreadyDone) await finalizeMockExamSession(session.id);

  redirect(`/simulados/${session.mockExamId}/resultado`);
}
