import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import { paymentReceiptTemplate, pixCodeGeneratedTemplate, pixPaymentPendingTemplate } from "@/lib/email/templates";

/**
 * Envia o recibo de pagamento ao usuário. Best-effort: nunca lança — um erro
 * de e-mail não pode afetar o processamento do webhook/pagamento.
 */
export async function sendPaymentReceiptEmail(input: {
  userId: string;
  planId: string;
  amountCents: number;
  provider: "STRIPE" | "MERCADO_PAGO";
  endsAt?: Date | null;
}): Promise<void> {
  try {
    const [user, plan, appSettings] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
      prisma.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { name: true } }),
      getAppSettings()
    ]);
    if (!user?.email || !plan) return;
    const tpl = paymentReceiptTemplate({
      appName: appSettings.appName,
      planName: plan.name,
      amountCents: input.amountCents,
      provider: input.provider,
      endsAt: input.endsAt ?? null
    });
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch {
    // ignora
  }
}

type PixEmailInput = {
  userId: string;
  planId: string;
  amountCents: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: Date | null;
};

/**
 * Envia o QR Code + copia-e-cola de um Pix recém-gerado ao usuário — tanto no checkout do
 * próprio cliente quanto numa cobrança avulsa emitida pelo admin. Best-effort: nunca lança
 * (mesmo racional de sendPaymentReceiptEmail — e-mail nunca pode derrubar o fluxo de pagamento).
 */
export async function sendPixCodeEmail(input: PixEmailInput): Promise<void> {
  try {
    const [user, plan, appSettings] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
      prisma.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { name: true } }),
      getAppSettings()
    ]);
    if (!user?.email || !plan) return;
    const tpl = pixCodeGeneratedTemplate({
      appName: appSettings.appName,
      planName: plan.name,
      amountCents: input.amountCents,
      qrCode: input.qrCode,
      qrCodeBase64: input.qrCodeBase64,
      expiresAt: input.expiresAt
    });
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch {
    // ignora
  }
}

/**
 * Lembrete de Pix pendente (ver /api/cron/pix-payment-reminders). Devolve o SendEmailResult
 * completo (não só ok/erro) pra o cron decidir se marca reminderSentAt: "skipped" (e-mail
 * desligado) marca como enviado — não adianta tentar de novo — só erro real de envio não marca,
 * pra repetir na próxima rodada. Mesmo racional de subscription-reminders/route.ts.
 */
export async function sendPixPaymentPendingReminder(input: PixEmailInput): Promise<SendEmailResult> {
  try {
    const [user, plan, appSettings] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
      prisma.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { name: true } }),
      getAppSettings()
    ]);
    if (!user?.email || !plan) return { ok: false, skipped: true };
    const tpl = pixPaymentPendingTemplate({
      appName: appSettings.appName,
      planName: plan.name,
      amountCents: input.amountCents,
      qrCode: input.qrCode,
      qrCodeBase64: input.qrCodeBase64,
      expiresAt: input.expiresAt
    });
    return await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao enviar lembrete de Pix." };
  }
}
