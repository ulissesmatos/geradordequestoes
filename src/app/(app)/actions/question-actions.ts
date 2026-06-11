"use server";

import { Difficulty, FeedbackType, QuestionAnswer, QuestionFormat, QuestionSetMode, QuestionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { generateAndSaveQuestionSet } from "@/lib/question-sets";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

const attemptSchema = z.object({
  questionId: z.string(),
  userAnswer: z.nativeEnum(QuestionAnswer).optional(),
  selectedOptionId: z.string().optional(),
  userAnswerText: z.string().optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(36000).default(0)
});

export async function answerQuestionAction(formData: FormData) {
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
  if (!question) throw new Error("Questão não encontrada ou indisponível.");

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

  revalidatePath("/ai");
}

export async function generateUserQuestionsAction(
  _: { ok?: boolean; questionSetId?: string; error?: string } | null,
  formData: FormData
) {
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

  try {
    await assertCanGenerateWithAi(user);
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
      context: context || undefined
    });
    revalidatePath("/questoes/gerar");
    revalidatePath("/biblioteca");
    revalidatePath("/ai");
    return { ok: true, questionSetId: questionSet.id };
  } catch (error) {
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
