import { PaymentCheckoutStatus, PaymentProvider } from "@prisma/client";
import { sendPixPaymentPendingReminder } from "@/lib/email/notifications";
import { getPaymentSettings } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PixMetadata = {
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

/**
 * Lembrete de Pix pendente (checkout que o cliente ou o admin gerou, mas ainda não pagou).
 * Mesmo esqueleto de /api/cron/subscription-reminders: protegido por CRON_SECRET, roda sobre
 * uma janela de tempo (pixReminderAfterHours, configurável em Admin → Pagamentos), marca
 * reminderSentAt pra não reenviar. Rodar a cada 30-60min é suficiente — o campo evita duplicidade
 * mesmo com execuções mais frequentes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET não configurado." }, { status: 500 });

  const url = new URL(request.url);
  const headerOk = request.headers.get("authorization") === `Bearer ${secret}`;
  const queryOk = url.searchParams.get("secret") === secret;
  if (!headerOk && !queryOk) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getPaymentSettings();
  const now = new Date();
  const threshold = new Date(now.getTime() - settings.pixReminderAfterHours * 60 * 60 * 1000);

  const candidates = await prisma.paymentCheckoutSession.findMany({
    where: {
      provider: PaymentProvider.MERCADO_PAGO,
      status: PaymentCheckoutStatus.PENDING,
      reminderSentAt: null,
      createdAt: { lte: threshold },
      expiresAt: { gt: now }
    },
    take: 200
  });

  let sent = 0;
  let withPix = 0;

  for (const checkout of candidates) {
    const metadata = (checkout.metadata ?? {}) as PixMetadata;
    const tx = metadata.point_of_interaction?.transaction_data;
    // Só quem realmente tem um Pix gerado (checkout via preferência/CHECKOUT_PRO nunca guardou
    // QR local — nada pra lembrar).
    if (!tx?.qr_code && !tx?.qr_code_base64) continue;
    withPix++;

    try {
      const result = await sendPixPaymentPendingReminder({
        userId: checkout.userId,
        planId: checkout.planId,
        amountCents: checkout.amountCents,
        qrCode: tx.qr_code ?? null,
        qrCodeBase64: tx.qr_code_base64 ?? null,
        expiresAt: checkout.expiresAt
      });
      // Marca como enviado mesmo se o e-mail estiver desabilitado (skipped) para não acumular
      // tentativas; só repete na próxima rodada em caso de erro real de envio.
      if (result.ok || ("skipped" in result && result.skipped)) {
        await prisma.paymentCheckoutSession.update({ where: { id: checkout.id }, data: { reminderSentAt: new Date() } });
        if (result.ok) sent++;
      }
    } catch {
      // ignora este e tenta os demais
    }
  }

  return Response.json({ ok: true, candidates: candidates.length, withPix, sent });
}
