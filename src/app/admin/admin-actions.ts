"use server";

import { AiChatPresetUsageLevel, AiProvider, CouponType, Difficulty, QuestionAnswer, QuestionStatus, Role, SourceType, SubscriptionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateQuestions } from "@/lib/ai/generateQuestions";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

const subjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional()
});

export async function createSubjectAction(formData: FormData) {
  await requireAdmin();
  const parsed = subjectSchema.parse({ name: formData.get("name"), description: formData.get("description") || undefined });
  await prisma.subject.create({ data: { ...parsed, slug: slugify(parsed.name) } });
  revalidatePath("/admin/materias");
}

export async function createTopicAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");
  await prisma.topic.create({
    data: {
      name,
      subjectId,
      slug: slugify(name),
      description: String(formData.get("description") ?? "")
    }
  });
  revalidatePath("/admin/assuntos");
}

export async function createQuestionAction(formData: FormData) {
  const admin = await requireAdmin();
  const answer = (formData.get("answer") || null) as QuestionAnswer | null;
  await prisma.question.create({
    data: {
      subjectId: String(formData.get("subjectId")),
      topicId: String(formData.get("topicId")),
      statement: String(formData.get("statement")),
      answer,
      explanation: String(formData.get("explanation")),
      difficulty: formData.get("difficulty") as Difficulty,
      status: formData.get("status") as QuestionStatus,
      sourceType: SourceType.MANUAL,
      createdById: admin.id,
      options: {
        create: [
          { label: "C", text: "Certo", isCorrect: answer === "CERTO", order: 1 },
          { label: "E", text: "Errado", isCorrect: answer === "ERRADO", order: 2 }
        ]
      }
    }
  });
  revalidatePath("/admin/questoes");
}

export async function reviewQuestionAction(formData: FormData) {
  const admin = await requireAdmin();
  await prisma.question.update({
    where: { id: String(formData.get("questionId")) },
    data: {
      statement: String(formData.get("statement")),
      answer: (formData.get("answer") || null) as QuestionAnswer | null,
      explanation: String(formData.get("explanation")),
      difficulty: formData.get("difficulty") as Difficulty,
      status: formData.get("status") as QuestionStatus,
      reviewedById: admin.id
    }
  });
  revalidatePath("/admin/questoes");
  revalidatePath("/admin/questoes/revisar");
}

export async function updateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const nextRole = formData.get("role") as Role;
  const nextIsBlocked = formData.get("isBlocked") === "on";

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isBlocked: true }
  });
  if (!targetUser) throw new Error("Usuário não encontrado.");

  const isRemovingActiveAdmin = targetUser.role === Role.ADMIN && !targetUser.isBlocked && (nextRole !== Role.ADMIN || nextIsBlocked);
  if (isRemovingActiveAdmin) {
    const activeAdminCount = await prisma.user.count({
      where: { role: Role.ADMIN, isBlocked: false }
    });
    if (activeAdminCount <= 1) {
      throw new Error("Não é possível rebaixar ou bloquear o último administrador ativo.");
    }
  }

  if (admin.id === targetUser.id && (nextRole !== Role.ADMIN || nextIsBlocked)) {
    throw new Error("Você não pode rebaixar ou bloquear a própria conta administrativa.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: nextRole,
      isBlocked: nextIsBlocked
    }
  });
  await logAdminAction(admin, { action: "update", entity: "User", entityId: userId, summary: `role=${nextRole} bloqueado=${nextIsBlocked}` });
  revalidatePath("/admin/usuarios");
}

export async function activateUserSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const couponId = String(formData.get("couponId") || "") || undefined;

  await prisma.userSubscription.updateMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() }
  });

  await prisma.userSubscription.create({
    data: {
      userId,
      planId,
      couponId,
      status: SubscriptionStatus.ACTIVE
    }
  });

  await logAdminAction(admin, { action: "activate_subscription", entity: "User", entityId: userId, summary: `plano=${planId}` });
  revalidatePath("/admin/usuarios");
}

export async function cancelUserSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  await prisma.userSubscription.updateMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() }
  });
  await logAdminAction(admin, { action: "cancel_subscription", entity: "User", entityId: userId });
  revalidatePath("/admin/usuarios");
}

export async function createPlanAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "");
  await prisma.subscriptionPlan.create({
    data: {
      name,
      slug: await uniquePlanSlug(name),
      description: String(formData.get("description") ?? ""),
      marketingSubtitle: String(formData.get("marketingSubtitle") ?? ""),
      ctaText: String(formData.get("ctaText") || "Assinar com cartão"),
      displayOrder: Number(formData.get("displayOrder") ?? 0),
      isHighlighted: formData.get("isHighlighted") === "on",
      features: parseFeatures(String(formData.get("features") ?? "")),
      stripePriceId: String(formData.get("stripePriceId") || "") || null,
      mercadoPagoReference: String(formData.get("mercadoPagoReference") || "") || null,
      priceCents: Math.round(Number(formData.get("price") ?? 0) * 100),
      aiGenerationsPerDay: Number(formData.get("aiGenerationsPerDay") ?? 20),
      isActive: formData.get("isActive") === "on"
    }
  });
  revalidatePath("/admin/planos");
  revalidatePath("/pricing");
  revalidatePath("/");
  revalidatePath("/assinatura");
}

export async function updatePlanAction(formData: FormData) {
  await requireAdmin();
  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const current = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!current) throw new Error("Plano não encontrado.");

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      name,
      slug: name !== current.name ? await uniquePlanSlug(name, planId) : current.slug,
      description: String(formData.get("description") ?? ""),
      marketingSubtitle: String(formData.get("marketingSubtitle") ?? ""),
      ctaText: String(formData.get("ctaText") || "Assinar com cartão"),
      displayOrder: Number(formData.get("displayOrder") ?? 0),
      isHighlighted: formData.get("isHighlighted") === "on",
      features: parseFeatures(String(formData.get("features") ?? "")),
      stripePriceId: String(formData.get("stripePriceId") || "") || null,
      mercadoPagoReference: String(formData.get("mercadoPagoReference") || "") || null,
      priceCents: Math.round(Number(formData.get("price") ?? 0) * 100),
      aiGenerationsPerDay: Number(formData.get("aiGenerationsPerDay") ?? 20),
      isActive: formData.get("isActive") === "on"
    }
  });
  revalidatePath("/admin/planos");
  revalidatePath("/pricing");
  revalidatePath("/");
  revalidatePath("/assinatura");
}

export async function updatePricingContentAction(formData: FormData) {
  await requireAdmin();
  await prisma.pricingContent.upsert({
    where: { id: "default" },
    update: {
      headline: String(formData.get("headline") ?? ""),
      subheadline: String(formData.get("subheadline") ?? ""),
      paywallTitle: String(formData.get("paywallTitle") ?? ""),
      paywallDescription: String(formData.get("paywallDescription") ?? "")
    },
    create: {
      id: "default",
      headline: String(formData.get("headline") ?? ""),
      subheadline: String(formData.get("subheadline") ?? ""),
      paywallTitle: String(formData.get("paywallTitle") ?? ""),
      paywallDescription: String(formData.get("paywallDescription") ?? "")
    }
  });
  revalidatePath("/admin/planos");
  revalidatePath("/pricing");
  revalidatePath("/");
  revalidatePath("/assinatura");
}

export async function updateAppSettingsAction(formData: FormData) {
  await requireAdmin();
  await prisma.appSetting.upsert({
    where: { id: "default" },
    update: {
      appName: String(formData.get("appName") || "Gerador de Questões"),
      logoUrl: String(formData.get("logoUrl") || "/brand/logo.png"),
      faviconUrl: String(formData.get("faviconUrl") || "/brand/favicon.png"),
      primaryColor: String(formData.get("primaryColor") || "#13666a"),
      accentColor: String(formData.get("accentColor") || "#f6d979"),
      publicUrl: String(formData.get("publicUrl") || "") || null,
      adminEmails: String(formData.get("adminEmails") || ""),
      institutionalText: String(formData.get("institutionalText") || ""),
      termsUrl: String(formData.get("termsUrl") || "") || null,
      privacyUrl: String(formData.get("privacyUrl") || "") || null
    },
    create: {
      id: "default",
      appName: String(formData.get("appName") || "Gerador de Questões"),
      logoUrl: String(formData.get("logoUrl") || "/brand/logo.png"),
      faviconUrl: String(formData.get("faviconUrl") || "/brand/favicon.png"),
      primaryColor: String(formData.get("primaryColor") || "#13666a"),
      accentColor: String(formData.get("accentColor") || "#f6d979"),
      publicUrl: String(formData.get("publicUrl") || "") || null,
      adminEmails: String(formData.get("adminEmails") || ""),
      institutionalText: String(formData.get("institutionalText") || ""),
      termsUrl: String(formData.get("termsUrl") || "") || null,
      privacyUrl: String(formData.get("privacyUrl") || "") || null
    }
  });
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/admin/branding");
}

export async function updatePaymentGatewaySettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const stripeSecretKey = String(formData.get("stripeSecretKey") ?? "").trim();
  const stripeWebhookSecret = String(formData.get("stripeWebhookSecret") ?? "").trim();
  const mercadoPagoAccessToken = String(formData.get("mercadoPagoAccessToken") ?? "").trim();
  const mercadoPagoWebhookSecret = String(formData.get("mercadoPagoWebhookSecret") ?? "").trim();
  const mercadoPagoPublicKey = String(formData.get("mercadoPagoPublicKey") ?? "").trim();

  await prisma.paymentGatewaySetting.upsert({
    where: { id: "default" },
    update: {
      ...(stripeSecretKey ? { stripeSecretKey: encryptSecret(stripeSecretKey) } : {}),
      ...(stripeWebhookSecret ? { stripeWebhookSecret: encryptSecret(stripeWebhookSecret) } : {}),
      ...(mercadoPagoAccessToken ? { mercadoPagoAccessToken: encryptSecret(mercadoPagoAccessToken) } : {}),
      ...(mercadoPagoWebhookSecret ? { mercadoPagoWebhookSecret: encryptSecret(mercadoPagoWebhookSecret) } : {}),
      mercadoPagoPublicKey: mercadoPagoPublicKey || null,
      stripePortalEnabled: formData.get("stripePortalEnabled") === "on",
      testMode: formData.get("testMode") === "on"
    },
    create: {
      id: "default",
      stripeSecretKey: stripeSecretKey ? encryptSecret(stripeSecretKey) : null,
      stripeWebhookSecret: stripeWebhookSecret ? encryptSecret(stripeWebhookSecret) : null,
      mercadoPagoAccessToken: mercadoPagoAccessToken ? encryptSecret(mercadoPagoAccessToken) : null,
      mercadoPagoWebhookSecret: mercadoPagoWebhookSecret ? encryptSecret(mercadoPagoWebhookSecret) : null,
      mercadoPagoPublicKey: mercadoPagoPublicKey || null,
      stripePortalEnabled: formData.get("stripePortalEnabled") === "on",
      testMode: formData.get("testMode") === "on"
    }
  });
  await logAdminAction(admin, { action: "update", entity: "PaymentGatewaySetting", summary: "chaves de pagamento atualizadas" });
  revalidatePath("/admin/pagamentos");
}

export async function createCouponAction(formData: FormData) {
  await requireAdmin();
  await prisma.coupon.create({
    data: {
      code: String(formData.get("code") ?? "").trim().toUpperCase(),
      type: formData.get("type") as CouponType,
      value: Number(formData.get("value") ?? 0),
      maxUses: formData.get("maxUses") ? Number(formData.get("maxUses")) : null,
      isActive: formData.get("isActive") === "on"
    }
  });
  revalidatePath("/admin/planos");
}

export async function updateAiProviderSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = formData.get("provider") as AiProvider;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const appName = String(formData.get("appName") ?? "").trim();
  const chatPresetUsageLevel = (formData.get("chatPresetUsageLevel") as AiChatPresetUsageLevel) || AiChatPresetUsageLevel.MEDIO;

  await prisma.aiProviderSetting.upsert({
    where: { id: "default" },
    update: {
      provider,
      ...(apiKey ? { apiKey: encryptSecret(apiKey) } : {}),
      model,
      baseUrl: baseUrl || null,
      siteUrl: siteUrl || null,
      appName: appName || null,
      chatPresetUsageLevel
    },
    create: {
      id: "default",
      provider,
      apiKey: apiKey ? encryptSecret(apiKey) : null,
      model,
      baseUrl: baseUrl || null,
      siteUrl: siteUrl || null,
      appName: appName || null,
      chatPresetUsageLevel
    }
  });

  await logAdminAction(admin, { action: "update", entity: "AiProviderSetting", summary: `provider=${provider} model=${model}` });
  revalidatePath("/admin/ia");
}

async function uniquePlanSlug(name: string, excludePlanId?: string) {
  const base = slugify(name) || "plano";
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludePlanId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function parseFeatures(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function generateQuestionsAction(_: { ok?: boolean; logId?: string; error?: string } | null, formData: FormData) {
  const admin = await requireAdmin();
  const subjectId = String(formData.get("subjectId"));
  const topicId = String(formData.get("topicId"));
  const difficulty = formData.get("difficulty") as Difficulty;
  const quantity = Math.min(Number(formData.get("quantity") ?? 5), 20);
  const extraInstructions = String(formData.get("extraInstructions") ?? "");
  const [subject, topic] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { id: subjectId } }),
    prisma.topic.findUniqueOrThrow({ where: { id: topicId } })
  ]);

  let logId: string | undefined;
  try {
    const generated = await generateQuestions({
      subject: subject.name,
      topic: topic.name,
      difficulty,
      quantity,
      extraInstructions
    });

    const log = await prisma.aiGenerationLog.create({
      data: {
        adminId: admin.id,
        subjectId,
        topicId,
        difficulty,
        quantity,
        model: generated.model,
        prompt: generated.prompt,
        status: "SUCCESS"
      }
    });
    logId = log.id;

    await prisma.$transaction(
      generated.questions.map((question, index) =>
        prisma.question.create({
          data: {
            subjectId,
            topicId,
            orderInSet: index + 1,
            format: question.format,
            statement: question.statement,
            answer: question.answer as QuestionAnswer | null,
            explanation: question.explanation,
            difficulty: question.difficulty as Difficulty,
            status: QuestionStatus.PENDING_REVIEW,
            sourceType: SourceType.AI,
            aiModel: generated.model,
            createdById: admin.id,
            options: {
              create: question.options.map((option, optionIndex) => ({
                label: option.label,
                text: option.text,
                isCorrect: option.isCorrect,
                order: optionIndex + 1
              }))
            }
          }
        })
      )
    );
  } catch (error) {
    await prisma.aiGenerationLog.create({
      data: {
        adminId: admin.id,
        subjectId,
        topicId,
        difficulty,
        quantity,
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        prompt: extraInstructions,
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
      }
    });
    return { error: error instanceof Error ? error.message : "Erro desconhecido" };
  }

  revalidatePath("/admin/questoes/gerar");
  revalidatePath("/admin/questoes/revisar");
  return { ok: true, logId };
}

// ── Edição/exclusão (CRUD) com auditoria ────────────────────────────────────

export async function updateSubjectAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || name.length < 2) return;
  await prisma.subject.update({ where: { id }, data: { name, description: String(formData.get("description") ?? "") } });
  await logAdminAction(admin, { action: "update", entity: "Subject", entityId: id, summary: name });
  revalidatePath("/admin/materias");
}

export async function deleteSubjectAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const questionCount = await prisma.question.count({ where: { subjectId: id } });
  if (questionCount > 0) {
    throw new Error(`Não é possível excluir: existem ${questionCount} questões nesta matéria.`);
  }
  const subject = await prisma.subject.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Subject", entityId: id, summary: subject.name });
  revalidatePath("/admin/materias");
  revalidatePath("/admin/assuntos");
}

export async function updateTopicAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || name.length < 2) return;
  await prisma.topic.update({ where: { id }, data: { name, description: String(formData.get("description") ?? "") } });
  await logAdminAction(admin, { action: "update", entity: "Topic", entityId: id, summary: name });
  revalidatePath("/admin/assuntos");
}

export async function deleteTopicAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const questionCount = await prisma.question.count({ where: { topicId: id } });
  if (questionCount > 0) {
    throw new Error(`Não é possível excluir: existem ${questionCount} questões neste assunto.`);
  }
  const topic = await prisma.topic.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Topic", entityId: id, summary: topic.name });
  revalidatePath("/admin/assuntos");
}

export async function deleteCouponAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const coupon = await prisma.coupon.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Coupon", entityId: id, summary: coupon.code });
  revalidatePath("/admin/planos");
}

export async function deleteQuestionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.question.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Question", entityId: id });
  revalidatePath("/admin/questoes");
  revalidatePath("/admin/questoes/revisar");
}
