import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { paymentReceiptTemplate } from "@/lib/email/templates";

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
