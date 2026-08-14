"use server";

import {
  AiChatPresetUsageLevel,
  AiProvider,
  CouponType,
  Difficulty,
  EmailProvider,
  ExpenseCategory,
  MarketingChannel,
  MercadoPagoCheckoutMode,
  PaymentProvider,
  PopupAudience,
  PopupKind,
  QuestionAnswer,
  QuestionFormat,
  QuestionSetShareVisibility,
  QuestionStatus,
  Role,
  SourceType,
  SubscriptionCancelReason,
  SubscriptionStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { z } from "zod";
import { generateQuestions } from "@/lib/ai/generateQuestions";
import { computeCostUsd, ZERO_USAGE, type TokenUsage } from "@/lib/ai/pricing";
import { formatReviewedExamplesContext, getReviewedExampleQuestions } from "@/lib/ai/reviewed-examples";
import { logAdminAction } from "@/lib/audit";
import { readCapabilitiesFromForm } from "@/lib/capabilities";
import { resolveSecretUpdate } from "@/lib/crypto";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { sendPixCodeEmail } from "@/lib/email/notifications";
import { adminPasswordChangedTemplate, testEmailTemplate } from "@/lib/email/templates";
import { requireAdmin } from "@/lib/guards";
import { createPixPayment } from "@/lib/mercado-pago";
import { appUrl, cancelLinkedStripeSubscriptions, getPaymentSettings, syncStripePortalPolicy } from "@/lib/payments";
import { generateReadablePassword, issuePasswordResetCode, setUserPassword } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { repeatAfterHoursFromForm } from "@/lib/popups";
import { stripNullBytes } from "@/lib/sanitize";
import { slugify } from "@/lib/utils";
import { isValidCpf, onlyDigits } from "@/lib/validation/cpf";

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
  revalidatePath("/admin/materias");
}

export type CreateTopicsBulkState = { ok?: boolean; created?: number; skipped?: number; error?: string; stamp?: number } | null;

/**
 * Cria vários assuntos de uma vez para uma matéria. Aceita nomes separados por
 * vírgula, ponto e vírgula ou quebra de linha (cola direta do conteúdo
 * programático do edital). Duplicados (mesmo slug na matéria) são ignorados.
 */
export async function createTopicsBulkAction(_: CreateTopicsBulkState, formData: FormData): Promise<CreateTopicsBulkState> {
  const admin = await requireAdmin();
  const subjectId = String(formData.get("subjectId") ?? "");
  const raw = String(formData.get("names") ?? "");

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } });
  if (!subject) return { error: "Matéria não encontrada.", stamp: Date.now() };

  const names = [...new Map(
    raw
      .split(/[,;\n]/)
      .map((part) => part.trim().replace(/\s+/g, " "))
      .filter((part) => part.length >= 2)
      .map((part) => [slugify(part), part] as const)
  ).entries()].map(([slug, name]) => ({ slug, name }));

  if (!names.length) return { error: "Informe ao menos um assunto (separe vários por vírgula ou linha).", stamp: Date.now() };
  if (names.length > 60) return { error: "Máximo de 60 assuntos por vez.", stamp: Date.now() };

  const result = await prisma.topic.createMany({
    data: names.map(({ name, slug }) => ({ subjectId: subject.id, name, slug, description: "" })),
    skipDuplicates: true
  });

  await logAdminAction(admin, {
    action: "create",
    entity: "Topic",
    summary: `${result.count} assunto(s) em ${subject.name}`
  });

  revalidatePath("/admin/materias");
  return { ok: true, created: result.count, skipped: names.length - result.count, stamp: Date.now() };
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
  const questionId = String(formData.get("questionId"));
  const answer = (formData.get("answer") || null) as QuestionAnswer | null;

  const current = await prisma.question.findUnique({ where: { id: questionId }, select: { format: true } });

  await prisma.question.update({
    where: { id: questionId },
    data: {
      statement: String(formData.get("statement")),
      supportText: String(formData.get("supportText") ?? "").trim() || null,
      answer,
      explanation: String(formData.get("explanation")),
      difficulty: formData.get("difficulty") as Difficulty,
      status: formData.get("status") as QuestionStatus,
      reviewedById: admin.id
    }
  });

  // Certo/Errado guarda o gabarito em DOIS lugares: Question.answer (o que a tela de admin
  // mostra) e QuestionOption.isCorrect (o que question-actions.ts usa de fato pra corrigir a
  // resposta do aluno, via selectedOptionId). Sem sincronizar os dois, corrigir um gabarito
  // errado aqui só mudava o texto na tela do admin — o aluno continuava sendo corrigido pelo
  // gabarito ANTIGO, porque a resposta dele referencia o option, não o campo answer.
  if (current?.format === QuestionFormat.CERTO_ERRADO && answer) {
    await Promise.all([
      prisma.questionOption.updateMany({ where: { questionId, label: "C" }, data: { isCorrect: answer === "CERTO" } }),
      prisma.questionOption.updateMany({ where: { questionId, label: "E" }, data: { isCorrect: answer === "ERRADO" } })
    ]);
  }

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
  revalidatePath("/admin/usuarios/[id]", "page");
}

/** Notifica o usuário por e-mail com a nova senha; best-effort — nunca lança. */
async function notifyPasswordChanged(user: { email: string }, password: string): Promise<boolean> {
  try {
    const appSettings = await getAppSettings();
    const template = adminPasswordChangedTemplate(password, appSettings.appName);
    const result = await sendEmail({ to: user.email, subject: template.subject, html: template.html, text: template.text });
    return result.ok;
  } catch {
    return false;
  }
}

/** Define a senha de um usuário diretamente. Usado quando o admin já tem a senha em mãos (ex.: ditada por telefone). */
export async function adminSetUserPasswordAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { ok: false, message: "A senha precisa ter pelo menos 8 caracteres." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new Error("Usuário não encontrado.");

  await setUserPassword(userId, password);
  const emailed = await notifyPasswordChanged(user, password);

  await logAdminAction(admin, {
    action: "set_password",
    entity: "User",
    entityId: userId,
    summary: `senha definida manualmente${emailed ? " e enviada por e-mail" : " (e-mail não enviado)"}`
  });
  revalidatePath("/admin/usuarios/[id]", "page");

  return {
    ok: true,
    message: emailed ? "Senha definida e enviada por e-mail ao usuário." : "Senha definida. Não foi possível enviar por e-mail — avise o usuário por outro canal."
  };
}

/** Gera uma senha aleatória, salva e tenta enviar por e-mail; devolve a senha em texto para o admin repassar se preciso. */
export async function adminGenerateRandomPasswordAction(formData: FormData): Promise<{ ok: boolean; password?: string; message: string }> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new Error("Usuário não encontrado.");

  const password = generateReadablePassword();
  await setUserPassword(userId, password);
  const emailed = await notifyPasswordChanged(user, password);

  await logAdminAction(admin, {
    action: "generate_random_password",
    entity: "User",
    entityId: userId,
    summary: `senha aleatória gerada${emailed ? " e enviada por e-mail" : " (e-mail não enviado)"}`
  });
  revalidatePath("/admin/usuarios/[id]", "page");

  return {
    ok: true,
    password,
    message: emailed ? "Senha gerada e enviada por e-mail ao usuário." : "Senha gerada. Não foi possível enviar por e-mail — copie e envie manualmente."
  };
}

/** Reaproveita o fluxo de autoatendimento: envia o código de redefinição de 6 dígitos por e-mail. */
export async function adminSendPasswordResetCodeAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new Error("Usuário não encontrado.");

  const result = await issuePasswordResetCode(user.email);
  await logAdminAction(admin, {
    action: "send_password_reset_code",
    entity: "User",
    entityId: userId,
    summary: result.sent ? "código de redefinição enviado" : `não enviado (${result.reason})`
  });

  if (result.sent) {
    return { ok: true, message: "Código de redefinição enviado por e-mail ao usuário." };
  }
  const reasonMessage: Record<typeof result.reason, string> = {
    no_account: "Usuário não encontrado.",
    no_password: "Este usuário ainda não tem senha cadastrada (login só via Google) — defina ou gere uma senha primeiro.",
    cooldown: "Um código já foi enviado há menos de 1 minuto. Aguarde um pouco antes de reenviar.",
    email_failed: "Falha ao enviar o e-mail — confira a configuração de e-mail em Admin > E-mail."
  };
  return { ok: false, message: reasonMessage[result.reason] };
}

export async function activateUserSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const couponId = String(formData.get("couponId") || "") || undefined;

  const previouslyActive = await prisma.userSubscription.findMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    select: { id: true }
  });
  // Cancela no Stripe ANTES de derrubar localmente — senão a assinatura antiga
  // continua sendo cobrada e a próxima fatura paga reativa a linha local.
  const { errors: stripeErrors } = await cancelLinkedStripeSubscriptions(previouslyActive.map((s) => s.id));

  // SUPERSEDED, não ADMIN: é o mesmo cliente continuando numa linha nova (troca de plano pelo
  // admin), não perda de cliente — nunca deve entrar em métrica de churn.
  await prisma.userSubscription.updateMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date(), cancelReason: SubscriptionCancelReason.SUPERSEDED }
  });

  await prisma.userSubscription.create({
    data: {
      userId,
      planId,
      couponId,
      status: SubscriptionStatus.ACTIVE
    }
  });

  await logAdminAction(admin, {
    action: "activate_subscription",
    entity: "User",
    entityId: userId,
    summary: stripeErrors.length ? `plano=${planId}; falha ao cancelar assinatura Stripe anterior: ${stripeErrors.join("; ")}` : `plano=${planId}`
  });
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/usuarios/[id]", "page");
}

export async function cancelUserSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const activeSubscriptions = await prisma.userSubscription.findMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    select: { id: true }
  });
  // Cancela no Stripe ANTES de marcar como cancelada localmente — senão o Stripe
  // continua cobrando o cliente e a próxima fatura paga reativa a linha local,
  // desfazendo o cancelamento sem avisar ninguém. respectCancelMode:true porque este É o
  // cancelamento "de verdade" (sem substituição) — aqui vale a política configurada em
  // Admin → Pagamentos (imediato ou no fim do período).
  const { errors: stripeErrors, deferredIds } = await cancelLinkedStripeSubscriptions(activeSubscriptions.map((s) => s.id), {
    respectCancelMode: true
  });
  const deferredSet = new Set(deferredIds);

  // As adiadas pro fim do período continuam ACTIVE aqui de propósito: no Stripe elas seguem
  // válidas (e cobrando) até lá, e cortar o acesso local agora deixaria o cliente pagando sem
  // acesso. O webhook customer.subscription.deleted marca CANCELED quando o período acabar de
  // verdade (ver mapStripeSubscriptionStatus em src/app/api/webhooks/stripe/route.ts).
  const idsToCancelNow = activeSubscriptions.filter((s) => !deferredSet.has(s.id)).map((s) => s.id);
  if (idsToCancelNow.length > 0) {
    await prisma.userSubscription.updateMany({
      where: { id: { in: idsToCancelNow } },
      data: { status: SubscriptionStatus.CANCELED, endsAt: new Date(), cancelReason: SubscriptionCancelReason.ADMIN }
    });
  }

  await logAdminAction(admin, {
    action: "cancel_subscription",
    entity: "User",
    entityId: userId,
    summary:
      [
        stripeErrors.length ? `falha ao cancelar no Stripe: ${stripeErrors.join("; ")}` : "",
        deferredIds.length ? `${deferredIds.length} assinatura(s) agendada(s) para o fim do período pago` : ""
      ]
        .filter(Boolean)
        .join(" · ") || undefined
  });
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/usuarios/[id]", "page");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (admin.id === userId) {
    throw new Error("Você não pode excluir a própria conta.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, email: true }
  });
  if (!target) throw new Error("Usuário não encontrado.");

  if (target.role === Role.ADMIN) {
    const activeAdminCount = await prisma.user.count({ where: { role: Role.ADMIN, isBlocked: false } });
    if (activeAdminCount <= 1) {
      throw new Error("Não é possível excluir o único administrador ativo.");
    }
  }

  // Cancela assinaturas ativas antes da exclusão (fica registrado no histórico via ON DELETE CASCADE).
  await prisma.userSubscription.updateMany({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date(), cancelReason: SubscriptionCancelReason.ADMIN }
  });

  // Remove explicitamente os logs de IA para que o banco comece limpo.
  // As sessões de chat são apagadas em cascata pelo ON DELETE CASCADE do User,
  // mas fazemos aqui explicitamente antes para garantir a ordem.
  await prisma.aiChatSession.deleteMany({ where: { userId } });
  await prisma.aiGenerationLog.deleteMany({ where: { userId } });
  await prisma.aiUsageEvent.deleteMany({ where: { userId } });

  // Exclui o usuário — o restante (tentativas, favoritos, materiais, pagamentos, etc.) é removido via cascata.
  await prisma.user.delete({ where: { id: userId } });

  // Auditoria: AdminAuditLog não tem FK para User, então o registro persiste mesmo após a exclusão.
  await logAdminAction(admin, {
    action: "delete",
    entity: "User",
    entityId: userId,
    summary: `${target.name} <${target.email}>`
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

/**
 * Cota opcional do plano: campo vazio significa ILIMITADO (null), não zero.
 *
 * A distinção importa — zero bloquearia o plano inteiro, e é fácil um formulário mandar
 * string vazia sem querer dizer "proibido tudo".
 */
function optionalQuota(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Math.trunc(Number(raw));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
      questionsPerMonth: optionalQuota(formData, "questionsPerMonth"),
      questionsPerDay: optionalQuota(formData, "questionsPerDay"),
      maxQuestionsPerGeneration: optionalQuota(formData, "maxQuestionsPerGeneration"),
      chatMessagesPerDay: optionalQuota(formData, "chatMessagesPerDay"),
      capabilities: readCapabilitiesFromForm(formData) ?? {},
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

  // Formulário sem o fieldset preserva o que já estava gravado (ver readCapabilitiesFromForm).
  const capabilities = readCapabilitiesFromForm(formData);

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      ...(capabilities ? { capabilities } : {}),
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
      questionsPerMonth: optionalQuota(formData, "questionsPerMonth"),
      questionsPerDay: optionalQuota(formData, "questionsPerDay"),
      maxQuestionsPerGeneration: optionalQuota(formData, "maxQuestionsPerGeneration"),
      chatMessagesPerDay: optionalQuota(formData, "chatMessagesPerDay"),
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

/**
 * Update PARCIAL: só grava os campos presentes no FormData. A página de branding tem vários
 * formulários que postam para esta mesma action; antes, cada um precisava reenviar todos os
 * outros campos como <input type="hidden"> para não zerá-los — um formulário novo que
 * esquecesse um hidden apagava a configuração silenciosamente. Com `has()`, cada formulário
 * cuida apenas dos seus campos.
 */
export async function updateAppSettingsAction(formData: FormData) {
  await requireAdmin();

  const text = (key: string, fallback: string) =>
    formData.has(key) ? { [key]: String(formData.get(key) || fallback) } : {};
  const nullable = (key: string) => (formData.has(key) ? { [key]: String(formData.get(key) || "").trim() || null } : {});
  const count = (key: string, fallback: number) =>
    formData.has(key) ? { [key]: Math.max(0, Number(formData.get(key) ?? fallback) || 0) } : {};
  const trialCapabilities = readCapabilitiesFromForm(formData, "trial");

  const fields = {
    ...text("appName", "Gerador de Questões"),
    ...text("logoUrl", "/brand/logo.png"),
    ...text("faviconUrl", "/brand/favicon.png"),
    ...text("primaryColor", "#13666a"),
    ...text("accentColor", "#f6d979"),
    ...text("adminEmails", ""),
    ...text("institutionalText", ""),
    ...nullable("publicUrl"),
    ...nullable("termsUrl"),
    ...nullable("privacyUrl"),
    ...nullable("termsContent"),
    ...nullable("privacyContent"),
    ...nullable("legalEntityName"),
    ...nullable("legalEntityCnpj"),
    ...nullable("supportEmail"),
    ...nullable("dpoName"),
    ...nullable("dpoEmail"),
    ...nullable("legalVenueCity"),
    ...count("trialGenerationsLimit", 10),
    ...count("bankDailyAnswersLimitTrial", 10),
    ...count("trialMaxQuestionsPerGeneration", 5),
    ...count("affiliateCommissionCapPayments", 1),
    // Mesma regra parcial dos demais campos: só grava se o formulário trouxe o fieldset.
    ...(trialCapabilities ? { trialCapabilities } : {}),
    // Checkbox precisa do marcador para "desmarcado" ser distinguível de "não veio no form".
    ...(formData.has("usageEnforcementSubmitted")
      ? { usageEnforcementEnabled: formData.get("usageEnforcementEnabled") === "on" }
      : {})
  };

  await prisma.appSetting.upsert({
    where: { id: "default" },
    update: fields,
    create: { id: "default", ...fields }
  });
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/admin/branding");
  revalidatePath("/admin/afiliados");
  revalidatePath("/termos");
  revalidatePath("/privacidade");
}

/**
 * Tira (ou devolve) uma transação do total de "Receita registrada" sem apagar o histórico.
 *
 * Serve para cortesia liberada no painel, cobrança de teste e estorno feito fora do gateway:
 * casos em que a transação existiu, mas o dinheiro não. Apagar a linha esconderia o fato;
 * a flag mantém o registro e conserta só o caixa.
 */
export async function toggleTransactionRevenueAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("transactionId") ?? "");

  const transaction = await prisma.paymentTransaction.findUnique({
    where: { id },
    select: { countsAsRevenue: true, amountCents: true, provider: true, user: { select: { email: true } } }
  });
  if (!transaction) throw new Error("Transação não encontrada.");

  const countsAsRevenue = !transaction.countsAsRevenue;
  await prisma.paymentTransaction.update({ where: { id }, data: { countsAsRevenue } });

  await logAdminAction(admin, {
    action: countsAsRevenue ? "include_in_revenue" : "exclude_from_revenue",
    entity: "PaymentTransaction",
    entityId: id,
    summary: `R$ ${(transaction.amountCents / 100).toFixed(2)} · ${transaction.provider} · ${transaction.user.email}`
  });
  revalidatePath("/admin/pagamentos");
  revalidatePath("/admin");
}

/**
 * Cobrança Pix avulsa: gera um PaymentCheckoutSession igual ao que o próprio cliente cria em
 * checkout/mercado-pago/page.tsx (mesmo modelo, mesmo externalReference) — o webhook/polling do
 * Mercado Pago (applyMercadoPagoPayment) já sabe ativar a assinatura e mandar o recibo quando
 * aprovado, sem nenhum código novo. Molde: issueTeamChargeAction (src/app/admin/teams/actions.ts).
 */
export async function issueUserPixChargeAction(formData: FormData) {
  const admin = await requireAdmin();
  // userId (hidden, quando a action é chamada de dentro da própria página do usuário) tem
  // prioridade sobre email (busca livre, usada em Admin → Pagamentos quando não se sabe o id).
  const userId = String(formData.get("userId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const planId = String(formData.get("planId") ?? "");
  if (!userId && !email) throw new Error("Informe o e-mail do usuário.");

  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(userId ? "Usuário não encontrado." : `Nenhum usuário encontrado com o e-mail ${email}.`);

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Selecione um plano.");

  const amountCents = Math.round(Number(formData.get("amount") ?? 0) * 100) || plan.priceCents;
  if (amountCents < 100) throw new Error("Informe um valor de pelo menos R$ 1,00.");

  // Pix exige CPF do pagador. Se o usuário não tiver um salvo, usa o que o admin digitou
  // no mesmo form (e já aproveita para salvar no perfil dele).
  let cpf = onlyDigits(user.cpf ?? "");
  if (cpf.length !== 11) {
    const typedCpf = onlyDigits(String(formData.get("cpf") ?? ""));
    if (!isValidCpf(typedCpf)) {
      throw new Error(`${user.email} não tem CPF salvo — informe um CPF válido para gerar o Pix.`);
    }
    cpf = typedCpf;
    await prisma.user.update({ where: { id: user.id }, data: { cpf } });
  }

  const settings = await getPaymentSettings();
  if (!settings.mercadoPagoAccessToken) {
    throw new Error("Configure o Access Token do Mercado Pago em Admin → Pagamentos para emitir cobranças Pix.");
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const checkout = await prisma.paymentCheckoutSession.create({
    data: { userId: user.id, planId: plan.id, provider: PaymentProvider.MERCADO_PAGO, amountCents, expiresAt }
  });

  const [firstName, ...restName] = (user.name ?? "").trim().split(/\s+/);
  const lastName = restName.join(" ");

  try {
    const payment = await createPixPayment({
      accessToken: settings.mercadoPagoAccessToken,
      amountCents,
      description: `${plan.name} (cobrança emitida pelo admin)`,
      payer: { email: user.email, firstName, lastName: lastName || undefined, cpf },
      externalReference: checkout.id,
      notificationUrl: `${appUrl()}/api/webhooks/mercado-pago`,
      expiresAt
    });
    await prisma.paymentCheckoutSession.update({
      where: { id: checkout.id },
      data: { externalId: payment.id, metadata: payment.raw as object }
    });
    // Best-effort — mesmo que o e-mail falhe, a cobrança já está criada e visível/copiável no
    // painel; o admin também pode mandar manualmente.
    await sendPixCodeEmail({
      userId: user.id,
      planId: plan.id,
      amountCents,
      qrCode: payment.qrCode,
      qrCodeBase64: payment.qrCodeBase64,
      expiresAt
    });
  } catch (error) {
    // Falhou no Mercado Pago: remove a sessão órfã para não poluir a lista.
    await prisma.paymentCheckoutSession.delete({ where: { id: checkout.id } }).catch(() => {});
    throw error;
  }

  await logAdminAction(admin, {
    action: "create",
    entity: "PaymentCheckoutSession",
    entityId: checkout.id,
    summary: `cobrança Pix avulsa de R$ ${(amountCents / 100).toFixed(2)} para ${user.email} (${plan.name})`
  });
  revalidatePath("/admin/pagamentos");
  revalidatePath("/admin/usuarios/[id]", "page");
}

export async function updatePaymentGatewaySettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const stripeSecretKey = String(formData.get("stripeSecretKey") ?? "").trim();
  const stripeWebhookSecret = String(formData.get("stripeWebhookSecret") ?? "").trim();
  const mercadoPagoAccessToken = String(formData.get("mercadoPagoAccessToken") ?? "").trim();
  const mercadoPagoWebhookSecret = String(formData.get("mercadoPagoWebhookSecret") ?? "").trim();
  const mercadoPagoPublicKey = String(formData.get("mercadoPagoPublicKey") ?? "").trim();

  // Campos de segredo: vazio = manter; __CLEAR__ = remover; texto = cifrar (resolveSecretUpdate)
  const secretUpdates = {
    ...resolveSecretUpdate("stripeSecretKey", stripeSecretKey),
    ...resolveSecretUpdate("stripeWebhookSecret", stripeWebhookSecret),
    ...resolveSecretUpdate("mercadoPagoAccessToken", mercadoPagoAccessToken),
    ...resolveSecretUpdate("mercadoPagoWebhookSecret", mercadoPagoWebhookSecret)
  };

  const mercadoPagoCheckoutMode =
    String(formData.get("mercadoPagoCheckoutMode") ?? "") === "TRANSPARENT"
      ? MercadoPagoCheckoutMode.TRANSPARENT
      : MercadoPagoCheckoutMode.CHECKOUT_PRO;
  const pixReminderAfterHours = Math.max(1, Math.round(Number(formData.get("pixReminderAfterHours") ?? 3)) || 3);

  await prisma.paymentGatewaySetting.upsert({
    where: { id: "default" },
    update: {
      ...secretUpdates,
      mercadoPagoPublicKey: mercadoPagoPublicKey || null,
      mercadoPagoCheckoutMode,
      pixReminderAfterHours,
      stripePortalEnabled: formData.get("stripePortalEnabled") === "on",
      testMode: formData.get("testMode") === "on"
    },
    create: {
      id: "default",
      ...secretUpdates,
      mercadoPagoPublicKey: mercadoPagoPublicKey || null,
      mercadoPagoCheckoutMode,
      pixReminderAfterHours,
      stripePortalEnabled: formData.get("stripePortalEnabled") === "on",
      testMode: formData.get("testMode") === "on"
    }
  });
  await logAdminAction(admin, { action: "update", entity: "PaymentGatewaySetting", summary: "chaves de pagamento atualizadas" });
  revalidatePath("/admin/pagamentos");
}

/**
 * Salva a política de cancelamento/proração e sincroniza com a billingPortal.configuration da
 * Stripe (syncStripePortalPolicy, em src/lib/payments.ts) — é essa config que efetivamente
 * governa o portal self-service do cliente. Ação separada de updatePaymentGatewaySettingsAction
 * de propósito: essa aqui faz uma chamada de rede à Stripe (pode falhar por config incompleta,
 * ex. sem plano com stripePriceId), e um erro ali não deve impedir salvar as chaves de API.
 */
export async function updateStripePortalPolicyAction(formData: FormData) {
  const admin = await requireAdmin();
  const cancelMode = String(formData.get("stripeCancelMode") ?? "") === "IMMEDIATE" ? "IMMEDIATE" : "AT_PERIOD_END";
  const prorationBehavior = String(formData.get("stripeProrationBehavior") ?? "") === "NONE" ? "NONE" : "CREATE_PRORATIONS";

  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey) {
    throw new Error("Configure a Secret key da Stripe antes de definir a política de cancelamento/proração.");
  }

  const stripe = new Stripe(settings.stripeSecretKey);
  let configurationId = settings.stripePortalConfigurationId;
  try {
    configurationId = await syncStripePortalPolicy({
      stripe,
      cancelMode,
      prorationBehavior,
      existingConfigurationId: settings.stripePortalConfigurationId
    });
  } catch (error) {
    throw new Error(
      `Salvo localmente, mas falhou ao sincronizar com a Stripe: ${error instanceof Error ? error.message : "erro desconhecido"}`
    );
  } finally {
    // Grava mesmo se a sincronização falhar: cancelUserSubscriptionAction lê esses campos
    // direto do banco (não depende da config da Stripe), então o cancelamento manual do admin
    // já respeita a escolha mesmo que o portal self-service não tenha sincronizado ainda.
    await prisma.paymentGatewaySetting.update({
      where: { id: "default" },
      data: { stripeCancelMode: cancelMode, stripeProrationBehavior: prorationBehavior, stripePortalConfigurationId: configurationId }
    });
  }

  await logAdminAction(admin, {
    action: "update",
    entity: "PaymentGatewaySetting",
    summary: `cancelamento=${cancelMode}; proração=${prorationBehavior}`
  });
  revalidatePath("/admin/pagamentos");
}

export async function updateEmailSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const providerRaw = String(formData.get("provider") ?? "BREVO");
  const provider = providerRaw === "RESEND" ? EmailProvider.RESEND : EmailProvider.BREVO;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim();
  const replyTo = String(formData.get("replyTo") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  // apiKey é segredo: vazio = manter; __CLEAR__ = remover; texto = cifrar.
  const secretUpdate = resolveSecretUpdate("apiKey", apiKey);
  const base = {
    provider,
    fromEmail: fromEmail || null,
    fromName: fromName || null,
    replyTo: replyTo || null,
    enabled
  };

  await prisma.emailSetting.upsert({
    where: { id: "default" },
    update: { ...base, ...secretUpdate },
    create: { id: "default", ...base, ...secretUpdate }
  });
  await logAdminAction(admin, { action: "update", entity: "EmailSetting", summary: `provedor de e-mail: ${provider}` });
  revalidatePath("/admin/email");
}

export async function sendTestEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  const to = String(formData.get("to") ?? "").trim() || admin.email;
  const appSettings = await getAppSettings();
  const template = testEmailTemplate(appSettings.appName);
  const result = await sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
  await logAdminAction(admin, {
    action: "test",
    entity: "EmailSetting",
    summary: result.ok ? `teste enviado para ${to}` : `falha no teste: ${"error" in result ? result.error : "não configurado"}`
  });
  revalidatePath("/admin/email");
}

export async function updateQuestionFeedbackStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const status = (["PENDING", "REVIEWED", "RESOLVED"] as const).includes(statusRaw as never)
    ? (statusRaw as "PENDING" | "REVIEWED" | "RESOLVED")
    : "REVIEWED";
  await prisma.questionFeedback.update({ where: { id }, data: { status } });
  await logAdminAction(admin, { action: "update", entity: "QuestionFeedback", entityId: id, summary: `status=${status}` });
  revalidatePath("/admin/feedbacks");
}

export async function toggleContactHandledAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const handled = formData.get("handled") === "true";
  await prisma.contactMessage.update({
    where: { id },
    data: { handledAt: handled ? new Date() : null }
  });
  await logAdminAction(admin, { action: "update", entity: "ContactMessage", entityId: id, summary: handled ? "marcado como tratado" : "reaberto" });
  revalidatePath("/admin/contato");
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

/** Campo vazio = preço não configurado (null); aceita vírgula ou ponto decimal. */
function parseOptionalPrice(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function updateAiProviderSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = formData.get("provider") as AiProvider;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const rawBaseUrl = String(formData.get("baseUrl") ?? "").trim();
  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const appName = String(formData.get("appName") ?? "").trim();

  // Rejeita baseUrl apontando para o próprio domínio da aplicação
  const appHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).hostname : null;
  const isSelfReferencing = rawBaseUrl && appHost && (() => {
    try { return new URL(rawBaseUrl).hostname === appHost; } catch { return false; }
  })();
  const baseUrl = isSelfReferencing ? "" : rawBaseUrl;
  const chatPresetUsageLevel = (formData.get("chatPresetUsageLevel") as AiChatPresetUsageLevel) || AiChatPresetUsageLevel.MEDIO;
  const inputPricePerMillionUsd = parseOptionalPrice(formData, "inputPricePerMillionUsd");
  const outputPricePerMillionUsd = parseOptionalPrice(formData, "outputPricePerMillionUsd");

  // apiKey é segredo: vazio = manter; __CLEAR__ = remover; texto = cifrar.
  const secretUpdate = resolveSecretUpdate("apiKey", apiKey);
  const webSearchKeyUpdate = resolveSecretUpdate("webSearchApiKey", String(formData.get("webSearchApiKey") ?? "").trim());
  const webSearchEnabled = formData.get("webSearchEnabled") === "on";
  await prisma.aiProviderSetting.upsert({
    where: { id: "default" },
    update: {
      provider,
      ...secretUpdate,
      ...webSearchKeyUpdate,
      webSearchEnabled,
      model,
      baseUrl: baseUrl || null,
      siteUrl: siteUrl || null,
      appName: appName || null,
      chatPresetUsageLevel,
      inputPricePerMillionUsd,
      outputPricePerMillionUsd
    },
    create: {
      id: "default",
      provider,
      apiKey: "apiKey" in secretUpdate ? secretUpdate.apiKey : null,
      webSearchApiKey: "webSearchApiKey" in webSearchKeyUpdate ? webSearchKeyUpdate.webSearchApiKey : null,
      webSearchEnabled,
      model,
      baseUrl: baseUrl || null,
      siteUrl: siteUrl || null,
      appName: appName || null,
      chatPresetUsageLevel,
      inputPricePerMillionUsd,
      outputPricePerMillionUsd
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
  const [subject, topic, reviewedExamples] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { id: subjectId } }),
    prisma.topic.findUniqueOrThrow({ where: { id: topicId } }),
    getReviewedExampleQuestions({ subjectId, topicId })
  ]);

  let logId: string | undefined;
  let usageSoFar: TokenUsage = ZERO_USAGE;
  try {
    const generated = await generateQuestions({
      subject: subject.name,
      topic: topic.name,
      difficulty,
      quantity,
      extraInstructions,
      reviewedExamplesContext: formatReviewedExamplesContext(reviewedExamples) || undefined,
      onUsage: (usage) => {
        usageSoFar = usage;
      }
    });

    const log = await prisma.aiGenerationLog.create({
      data: {
        userId: admin.id,
        subjectId,
        topicId,
        difficulty,
        quantity,
        model: generated.model,
        prompt: stripNullBytes(generated.prompt),
        userPrompt: stripNullBytes(extraInstructions) || null,
        responseText: stripNullBytes(JSON.stringify(generated.questions)),
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
        costUsd: generated.costUsd ?? undefined,
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
            supportText: question.supportText ?? null,
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
    const costUsd = await computeCostUsd(usageSoFar);
    await prisma.aiGenerationLog.create({
      data: {
        userId: admin.id,
        subjectId,
        topicId,
        difficulty,
        quantity,
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        prompt: extraInstructions,
        userPrompt: stripNullBytes(extraInstructions) || null,
        inputTokens: usageSoFar.inputTokens,
        outputTokens: usageSoFar.outputTokens,
        costUsd: costUsd ?? undefined,
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
  revalidatePath("/admin/materias");
}

export async function updateTopicAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || name.length < 2) return;
  await prisma.topic.update({ where: { id }, data: { name, description: String(formData.get("description") ?? "") } });
  await logAdminAction(admin, { action: "update", entity: "Topic", entityId: id, summary: name });
  revalidatePath("/admin/materias");
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
  revalidatePath("/admin/materias");
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

function parseOptionalPopupDate(formData: FormData, field: string): Date | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida em "${field}".`);
  return date;
}

function popupDataFromForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) throw new Error("Título e corpo do popup são obrigatórios.");

  const startsAt = parseOptionalPopupDate(formData, "startsAt");
  const endsAt = parseOptionalPopupDate(formData, "endsAt");
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new Error("O fim da campanha deve ser depois do início.");
  }

  return {
    title,
    kind: formData.get("kind") as PopupKind,
    eyebrow: String(formData.get("eyebrow") ?? "").trim() || null,
    body,
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    ctaLabel: String(formData.get("ctaLabel") ?? "").trim() || null,
    ctaUrl: String(formData.get("ctaUrl") ?? "").trim() || null,
    dismissLabel: String(formData.get("dismissLabel") ?? "").trim() || "Agora não",
    audience: formData.get("audience") as PopupAudience,
    repeatAfterHours: repeatAfterHoursFromForm(formData),
    isActive: formData.get("isActive") === "on",
    startsAt,
    endsAt,
    priority: Number(formData.get("priority") ?? 0)
  };
}

export async function createPopupAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = popupDataFromForm(formData);
  const popup = await prisma.popup.create({ data });
  await logAdminAction(admin, { action: "create", entity: "Popup", entityId: popup.id, summary: popup.title });
  revalidatePath("/admin/popups");
}

export async function updatePopupAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const current = await prisma.popup.findUnique({ where: { id } });
  if (!current) throw new Error("Popup não encontrado.");

  const data = popupDataFromForm(formData);
  await prisma.popup.update({ where: { id }, data });
  await logAdminAction(admin, { action: "update", entity: "Popup", entityId: id, summary: data.title });
  revalidatePath("/admin/popups");
}

export async function deletePopupAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const popup = await prisma.popup.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Popup", entityId: id, summary: popup.title });
  revalidatePath("/admin/popups");
}

/**
 * Reseta o histórico de visualização de um popup — cobre o caso de editar um popup "só 1 vez"
 * que parte da base já viu/dispensou: sem isso, essa parte nunca mais veria a versão nova.
 */
export async function resetPopupViewsAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { count } = await prisma.popupUserState.deleteMany({ where: { popupId: id } });
  await logAdminAction(admin, { action: "reset_views", entity: "Popup", entityId: id, summary: `${count} estado(s) removido(s)` });
  revalidatePath("/admin/popups");
}

/**
 * Painel /admin/compartilhamentos: diferente de updateQuestionSetShareVisibility (lib/question-
 * set-share.ts, que exige ser o DONO do link), aqui o admin ajusta o link de QUALQUER usuário —
 * é ferramenta de moderação, não de autoatendimento. Chamada direto do client component (não é
 * um <form action>), por isso recebe os argumentos posicionais em vez de FormData.
 */
export async function adminUpdateQuestionSetShareVisibilityAction(
  shareId: string,
  visibilityRaw: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const visibility = (Object.values(QuestionSetShareVisibility) as string[]).includes(visibilityRaw)
    ? (visibilityRaw as QuestionSetShareVisibility)
    : null;
  if (!visibility) return { ok: false, error: "Opção de visibilidade inválida." };

  const share = await prisma.questionSetShare.update({ where: { id: shareId }, data: { visibility } }).catch(() => null);
  if (!share) return { ok: false, error: "Link não encontrado." };

  await logAdminAction(admin, { action: "update", entity: "QuestionSetShare", entityId: shareId, summary: `visibility=${visibility}` });
  revalidatePath("/admin/compartilhamentos");
  return { ok: true };
}

export async function adminRevokeQuestionSetShareAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.questionSetShare.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAdminAction(admin, { action: "revoke", entity: "QuestionSetShare", entityId: id });
  revalidatePath("/admin/compartilhamentos");
}

/** Reverte um revoke feito por engano — o revoke em si já é "reversível" por natureza (soft-delete). */
export async function adminReactivateQuestionSetShareAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.questionSetShare.update({ where: { id }, data: { revokedAt: null } });
  await logAdminAction(admin, { action: "reactivate", entity: "QuestionSetShare", entityId: id });
  revalidatePath("/admin/compartilhamentos");
}

// ── Financeiro: despesas & campanhas de marketing ───────────────────────────

function parseMoneyToCents(formData: FormData, field: string): number {
  return Math.round(Number(formData.get(field) ?? 0) * 100);
}

function parseRequiredDate(formData: FormData, field: string, label: string): Date {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) throw new Error(`${label} é obrigatório.`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida em "${label}".`);
  return date;
}

function parseOptionalDate(formData: FormData, field: string): Date | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida em "${field}".`);
  return date;
}

function revalidateFinancialPaths() {
  revalidatePath("/admin/despesas");
  revalidatePath("/admin/campanhas");
  revalidatePath("/admin/analytics/caixa");
  revalidatePath("/admin");
}

export async function createExpenseAction(formData: FormData) {
  const admin = await requireAdmin();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Descrição é obrigatória.");
  const amountCents = parseMoneyToCents(formData, "amount");
  if (amountCents <= 0) throw new Error("Valor deve ser maior que zero.");

  const expense = await prisma.expense.create({
    data: {
      description,
      category: formData.get("category") as ExpenseCategory,
      amountCents,
      competenceDate: parseRequiredDate(formData, "competenceDate", "Data de competência"),
      paidAt: parseOptionalDate(formData, "paidAt"),
      countsAsExpense: formData.get("countsAsExpense") === "on",
      isRecurring: formData.get("isRecurring") === "on",
      vendor: String(formData.get("vendor") ?? "").trim() || null,
      campaignId: String(formData.get("campaignId") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      createdById: admin.id
    }
  });
  await logAdminAction(admin, {
    action: "create",
    entity: "Expense",
    entityId: expense.id,
    summary: `${description} — R$ ${(amountCents / 100).toFixed(2)}`
  });
  revalidateFinancialPaths();
}

export async function updateExpenseAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("expenseId") ?? "");
  if (!id) return;
  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Descrição é obrigatória.");
  const amountCents = parseMoneyToCents(formData, "amount");
  if (amountCents <= 0) throw new Error("Valor deve ser maior que zero.");

  await prisma.expense.update({
    where: { id },
    data: {
      description,
      category: formData.get("category") as ExpenseCategory,
      amountCents,
      competenceDate: parseRequiredDate(formData, "competenceDate", "Data de competência"),
      paidAt: parseOptionalDate(formData, "paidAt"),
      countsAsExpense: formData.get("countsAsExpense") === "on",
      isRecurring: formData.get("isRecurring") === "on",
      vendor: String(formData.get("vendor") ?? "").trim() || null,
      campaignId: String(formData.get("campaignId") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null
    }
  });
  await logAdminAction(admin, { action: "update", entity: "Expense", entityId: id, summary: description });
  revalidateFinancialPaths();
}

/** Redireciona sempre pra lista: usada tanto na lista (no-op de navegação) quanto na tela de edição
 * de uma despesa individual (onde, sem redirect, a página ficaria apontando pra um registro que não existe mais). */
export async function deleteExpenseAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const expense = await prisma.expense.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "Expense", entityId: id, summary: expense.description });
  revalidateFinancialPaths();
  redirect("/admin/despesas");
}

export async function createCampaignAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome é obrigatório.");
  const budgetRaw = String(formData.get("budget") ?? "").trim();

  const campaign = await prisma.marketingCampaign.create({
    data: {
      name,
      channel: formData.get("channel") as MarketingChannel,
      startDate: parseRequiredDate(formData, "startDate", "Data de início"),
      endDate: parseOptionalDate(formData, "endDate"),
      budgetCents: budgetRaw ? Math.round(Number(budgetRaw) * 100) : null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      isActive: formData.get("isActive") === "on"
    }
  });
  await logAdminAction(admin, { action: "create", entity: "MarketingCampaign", entityId: campaign.id, summary: name });
  revalidatePath("/admin/campanhas");
}

export async function updateCampaignAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("campaignId") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome é obrigatório.");
  const budgetRaw = String(formData.get("budget") ?? "").trim();

  await prisma.marketingCampaign.update({
    where: { id },
    data: {
      name,
      channel: formData.get("channel") as MarketingChannel,
      startDate: parseRequiredDate(formData, "startDate", "Data de início"),
      endDate: parseOptionalDate(formData, "endDate"),
      budgetCents: budgetRaw ? Math.round(Number(budgetRaw) * 100) : null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      isActive: formData.get("isActive") === "on"
    }
  });
  await logAdminAction(admin, { action: "update", entity: "MarketingCampaign", entityId: id, summary: name });
  revalidatePath("/admin/campanhas");
}

/** Despesas linkadas ficam (só desvinculam — ver onDelete: SetNull no schema), nunca somem. */
export async function deleteCampaignAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const campaign = await prisma.marketingCampaign.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "MarketingCampaign", entityId: id, summary: campaign.name });
  revalidatePath("/admin/campanhas");
  revalidatePath("/admin/despesas");
}
