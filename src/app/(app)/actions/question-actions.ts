"use server";

import { Difficulty, FeedbackType, QuestionAnswer, QuestionFormat, QuestionSetMode, QuestionStatus, TrialUsageKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { chargeTrialUsage, refundTrialUsage } from "@/lib/ai/usage";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getTrialBankStatus } from "@/lib/question-bank";
import { generateAndSaveQuestionSet } from "@/lib/question-sets";
import { applyAttemptToReviewState } from "@/lib/review";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

const attemptSchema = z.object({
  questionId: z.string(),
  userAnswer: z.nativeEnum(QuestionAnswer).optional(),
  selectedOptionId: z.string().optional(),
  userAnswerText: z.string().optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(36000).default(0)
});

export type AnswerQuestionResult =
  | { ok: true }
  | { ok: false; error: string; limitReached?: boolean };

export async function answerQuestionAction(formData: FormData): Promise<AnswerQuestionResult> {
  const user = await requireUser();
  const parsed = attemptSchema.parse({
    questionId: formData.get("questionId"),
    userAnswer: formData.get("userAnswer") || undefined,
    selectedOptionId: formData.get("selectedOptionId") || undefined,
    userAnswerText: formData.get("userAnswerText") || undefined,
    timeSpentSeconds: formData.get("timeSpentSeconds") ?? 0
  });

  const question = await prisma.question.findFirst({
    where: {
      id: parsed.questionId,
      OR: [{ status: QuestionStatus.APPROVED }, { createdById: user.id }]
    },
    include: { options: true }
  });
  if (!question) return { ok: false, error: "Questão não encontrada ou indisponível." };

  // Limite diário do trial no banco público: só para questões da plataforma
  // (as próprias já são limitadas pelo trial de geração de IA).
  if (question.createdById !== user.id) {
    const bankStatus = await getTrialBankStatus(user);
    if (bankStatus.isTrial && bankStatus.remaining !== null && bankStatus.remaining <= 0) {
      return {
        ok: false,
        limitReached: true,
        error: `Você usou as ${bankStatus.limit} respostas gratuitas de hoje no banco de questões. Assine um plano para responder sem limite.`
      };
    }
  }

  const selectedOption = parsed.selectedOptionId
    ? question.options.find((option) => option.id === parsed.selectedOptionId)
    : undefined;
  const isCorrect = selectedOption
    ? selectedOption.isCorrect
    : parsed.userAnswer
      ? parsed.userAnswer === question.answer
      : false;

  await prisma.questionAttempt.create({
    data: {
      userId: user.id,
      questionId: question.id,
      userAnswer: parsed.userAnswer,
      selectedOptionId: selectedOption?.id,
      userAnswerText: parsed.userAnswerText ?? selectedOption?.label ?? parsed.userAnswer,
      isCorrect,
      timeSpentSeconds: parsed.timeSpentSeconds
    }
  });

  // Alimenta a agenda de revisão espaçada (best-effort, nunca lança).
  await applyAttemptToReviewState({ userId: user.id, questionId: question.id, isCorrect });

  revalidatePath("/ai");
  return { ok: true };
}

export type GenerateUserQuestionsState = {
  ok?: boolean;
  questionSetId?: string;
  error?: string;
  closeVariantFallback?: boolean;
  /** Preenchido quando o teto do plano gratuito cortou a quantidade pedida. */
  trialQuantityCap?: { requested: number; applied: number };
};

export async function generateUserQuestionsAction(
  _: GenerateUserQuestionsState | null,
  formData: FormData
): Promise<GenerateUserQuestionsState> {
  const user = await requireUser();
  const subjectId = String(formData.get("subjectId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");
  const difficulty = formData.get("difficulty") as Difficulty;
  const quantity = Math.min(Number(formData.get("quantity") ?? 5), 15);
  const format = (formData.get("format") as QuestionFormat) || QuestionFormat.CERTO_ERRADO;
  const alternativesCount = Math.min(Math.max(Number(formData.get("alternativesCount") ?? 4), 2), 5);
  const mode = (formData.get("mode") as QuestionSetMode) || QuestionSetMode.ESTUDO;
  const prompt = String(formData.get("prompt") || formData.get("extraInstructions") || "");
  const title = String(formData.get("title") || "");
  const context = String(formData.get("context") || "");
  const closeVariant = formData.get("closeVariant") === "on";

  // Cota do trial cobrada na entrada e estornada se a geração falhar.
  let trialChargeId: string | null = null;
  try {
    await assertCanGenerateWithAi(user);
    trialChargeId = await chargeTrialUsage({ user, kind: TrialUsageKind.QUESTION_GENERATION });
    const questionSet = await generateAndSaveQuestionSet({
      user,
      subjectId,
      topicId,
      difficulty,
      quantity,
      format,
      alternativesCount,
      mode,
      prompt,
      title: title || undefined,
      context: context || undefined,
      closeVariant
    });
    revalidatePath("/questoes/gerar");
    revalidatePath("/biblioteca");
    revalidatePath("/ai");
    return {
      ok: true,
      questionSetId: questionSet.id,
      closeVariantFallback: closeVariant && questionSet.closeVariantFallback,
      trialQuantityCap: questionSet.trialQuantityCap ?? undefined
    };
  } catch (error) {
    // Geração não entregou o bloco: devolve a unidade cobrada.
    await refundTrialUsage(trialChargeId);
    await prisma.aiGenerationLog
      .create({
        data: {
          adminId: user.id,
          subjectId,
          topicId,
          difficulty,
          quantity,
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          prompt,
          status: "USER_ERROR",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
        }
      })
      .catch(() => undefined);

    return { error: error instanceof Error ? error.message : "Erro ao gerar questões." };
  }
}

export async function reportQuestionAction(
  _: { ok?: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const questionId = String(formData.get("questionId") ?? "");
  const typeRaw = String(formData.get("type") ?? "OUTRO");
  const type = (Object.values(FeedbackType) as string[]).includes(typeRaw)
    ? (typeRaw as FeedbackType)
    : FeedbackType.OUTRO;
  const message = String(formData.get("message") ?? "").trim().slice(0, 500) || null;

  if (!questionId) return { error: "Questão inválida." };

  // Um feedback por usuário por questão (upsert reabre como PENDING ao reenviar).
  await prisma.questionFeedback.upsert({
    where: { userId_questionId: { userId: user.id, questionId } },
    update: { type, message, status: "PENDING" },
    create: { userId: user.id, questionId, type, message }
  });
  return { ok: true };
}

export async function toggleFavoriteAction(formData: FormData) {
  const user = await requireUser();
  const questionId = String(formData.get("questionId") ?? "");
  await toggleFavoriteByIdAction(questionId);
}

export async function toggleFavoriteByIdAction(questionId: string) {
  const user = await requireUser();
  const existing = await prisma.favoriteQuestion.findUnique({
    where: { userId_questionId: { userId: user.id, questionId } }
  });
  if (existing) {
    await prisma.favoriteQuestion.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoriteQuestion.create({ data: { userId: user.id, questionId } });
  }
  revalidatePath("/biblioteca");
}

export async function archiveQuestionSetAction(formData: FormData) {
  const user = await requireUser();
  const setId = String(formData.get("setId") ?? "");
  await prisma.questionSet.updateMany({
    where: { id: setId, userId: user.id },
    data: { status: "ARCHIVED" }
  });
  revalidatePath("/biblioteca");
}
