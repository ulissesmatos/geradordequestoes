"use server";

import {
  Difficulty,
  FeedbackType,
  QuestionAnswer,
  QuestionFormat,
  QuestionSetMode,
  QuestionSetShareVisibility,
  QuestionStatus,
  Role,
  TrialUsageKind
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeCostUsd, ZERO_USAGE, type TokenUsage } from "@/lib/ai/pricing";
import { chargeTrialUsage, refundTrialUsage } from "@/lib/ai/usage";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getTrialBankStatus } from "@/lib/question-bank";
import { generateAndSaveQuestionSet } from "@/lib/question-sets";
import {
  createOrReactivateQuestionSetShare,
  revokeQuestionSetShare,
  updateQuestionSetShareVisibility,
  type RevokeActionResult,
  type ShareActionResult
} from "@/lib/question-set-share";
import { QUESTION_LIMITS, SHARE_PAID_ONLY_FREE_QUESTIONS } from "@/lib/question-limits";
import type { QuantityCapReason } from "@/lib/usage/ledger";
import { applyAttemptToReviewState } from "@/lib/review";
import { assertCanGenerateWithAi, hasActiveSubscription } from "@/lib/subscriptions";

const attemptSchema = z.object({
  questionId: z.string(),
  userAnswer: z.nativeEnum(QuestionAnswer).optional(),
  selectedOptionId: z.string().optional(),
  userAnswerText: z.string().optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(36000).default(0)
});

export type AnswerQuestionResult =
  | { ok: true; nextReviewDueAt: string | null }
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
      OR: [
        { status: QuestionStatus.APPROVED },
        { createdById: user.id },
        // Bloco compartilhado por outro usuário via link público (/q/<id>) e ainda ativo.
        // Filtro de relação: se a questão não tem questionSet, ou o set não tem share, ou o
        // share está revogado, a condição não bate — nenhum caso quebra, só não autoriza.
        { questionSet: { share: { revokedAt: null } } }
      ]
    },
    include: {
      options: true,
      questionSet: { select: { share: { select: { visibility: true } } } }
    }
  });
  if (!question) return { ok: false, error: "Questão não encontrada ou indisponível." };

  const shareVisibility = question.questionSet?.share?.visibility;

  // Bloco compartilhado como "só assinantes": conta sem assinatura (nem admin) só responde as
  // N primeiras — dono do bloco original está isento (createdById === user.id nunca cai aqui
  // porque hasActiveSubscription(admin) já é true, mas a ordem das checagens evita qualquer
  // ambiguidade quando um admin decide testar o próprio link sem estar "assinante").
  if (shareVisibility === QuestionSetShareVisibility.PAID_ONLY) {
    const entitled = await hasActiveSubscription(user);
    if (!entitled && (question.orderInSet ?? 1) > SHARE_PAID_ONLY_FREE_QUESTIONS) {
      return {
        ok: false,
        limitReached: true,
        error: `Este bloco é exclusivo para assinantes. As ${SHARE_PAID_ONLY_FREE_QUESTIONS} primeiras questões são gratuitas — assine um plano para responder o restante.`
      };
    }
  }

  // Limite diário do trial no banco público: já cobre questão compartilhada de outro usuário
  // por construção — `createdById` continua sendo o dono ORIGINAL, então essa condição dispara
  // tanto para o banco público quanto para um bloco alheio recém-liberado pelo OR acima.
  // Link "liberado para todos" (EVERYONE) é exceção deliberada: quem criou esse link como admin
  // quer um bloco sem NENHUMA fricção, então nem a cota diária do trial se aplica aqui.
  if (question.createdById !== user.id && shareVisibility !== QuestionSetShareVisibility.EVERYONE) {
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
  const reviewState = await applyAttemptToReviewState({ userId: user.id, questionId: question.id, isCorrect });

  revalidatePath("/ai");
  return { ok: true, nextReviewDueAt: reviewState?.dueAt.toISOString() ?? null };
}

export type GenerateUserQuestionsState = {
  ok?: boolean;
  questionSetId?: string;
  error?: string;
  closeVariantFallback?: boolean;
  /** Preenchido quando algum limite cortou a quantidade pedida; `reason` diz qual. */
  quantityCap?: { requested: number; applied: number; reason: QuantityCapReason | null };
};

export async function generateUserQuestionsAction(
  _: GenerateUserQuestionsState | null,
  formData: FormData
): Promise<GenerateUserQuestionsState> {
  const user = await requireUser();
  const subjectId = String(formData.get("subjectId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");
  const difficulty = formData.get("difficulty") as Difficulty;
  const quantity = Math.min(Number(formData.get("quantity") ?? 5), QUESTION_LIMITS.maxPerBlock);
  const format = (formData.get("format") as QuestionFormat) || QuestionFormat.CERTO_ERRADO;
  const alternativesCount = Math.min(Math.max(Number(formData.get("alternativesCount") ?? 4), 2), 5);
  const mode = (formData.get("mode") as QuestionSetMode) || QuestionSetMode.ESTUDO;
  const prompt = String(formData.get("prompt") || formData.get("extraInstructions") || "");
  const title = String(formData.get("title") || "");
  const context = String(formData.get("context") || "");
  const closeVariant = formData.get("closeVariant") === "on";

  // Só o livro-caixa LEGADO é cobrado aqui — ele é quem ainda bloqueia enquanto o
  // enforcement novo estiver desligado. As questões em si são medidas dentro de
  // generateAndSaveQuestionSet (medidor QUESTIONS); cobrar as duas coisas aqui repetiria a
  // dupla cobrança que estamos corrigindo.
  let trialChargeId: string | null = null;
  // Usage parcial: se a geração falhar depois de 1+ lotes bem-sucedidos num pedido grande,
  // esse custo real não pode ficar sem registro em nenhuma tabela — ver catch abaixo.
  let usageSoFar: TokenUsage = ZERO_USAGE;
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
      closeVariant,
      onUsage: (usage) => {
        usageSoFar = usage;
      }
    });
    revalidatePath("/questoes/gerar");
    revalidatePath("/biblioteca");
    revalidatePath("/ai");
    return {
      ok: true,
      questionSetId: questionSet.id,
      closeVariantFallback: closeVariant && questionSet.closeVariantFallback,
      quantityCap: questionSet.quantityCap ?? undefined
    };
  } catch (error) {
    // Geração não entregou o bloco: devolve a unidade cobrada.
    await refundTrialUsage(trialChargeId);
    const costUsd = await computeCostUsd(usageSoFar);
    await prisma.aiGenerationLog
      .create({
        data: {
          userId: user.id,
          subjectId,
          topicId,
          difficulty,
          quantity,
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          prompt,
          userPrompt: prompt || null,
          inputTokens: usageSoFar.inputTokens,
          outputTokens: usageSoFar.outputTokens,
          costUsd: costUsd ?? undefined,
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

/**
 * Sem FormData de propósito: chamadas diretamente pelo ShareLinkModal via
 * `.bind(null, questionSetId)` no server component que o renderiza — dispensa hidden input.
 */
export async function shareQuestionSetAction(questionSetId: string): Promise<ShareActionResult> {
  const user = await requireUser();
  const result = await createOrReactivateQuestionSetShare(user, questionSetId);
  if (result.ok) revalidatePath("/biblioteca");
  return result;
}

export async function revokeQuestionSetShareAction(questionSetId: string): Promise<RevokeActionResult> {
  const user = await requireUser();
  const result = await revokeQuestionSetShare(user.id, questionSetId);
  if (result.ok) revalidatePath("/biblioteca");
  return result;
}

/**
 * Só admin escolhe quem vê o link (ver QuestionSetShareVisibilityControl) — dono comum nunca
 * chama esta action, o controle nem aparece pra ele na UI, mas a checagem de role aqui é a
 * garantia real (a UI é só conveniência).
 */
export async function updateQuestionSetShareVisibilityAction(
  questionSetId: string,
  visibilityRaw: string
): Promise<RevokeActionResult> {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) return { ok: false, error: "Apenas administradores podem ajustar quem vê este link." };

  const visibility = (Object.values(QuestionSetShareVisibility) as string[]).includes(visibilityRaw)
    ? (visibilityRaw as QuestionSetShareVisibility)
    : null;
  if (!visibility) return { ok: false, error: "Opção de visibilidade inválida." };

  const result = await updateQuestionSetShareVisibility(user.id, questionSetId, visibility);
  if (result.ok) revalidatePath("/biblioteca");
  return result;
}
