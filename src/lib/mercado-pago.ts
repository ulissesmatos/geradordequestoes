import crypto from "crypto";
import { PaymentCheckoutStatus, PaymentProvider, PaymentTransactionStatus } from "@prisma/client";
import { incrementCouponUsage } from "@/lib/coupons";
import { activatePaidSubscription, pixAccessEndsAt, recordPaymentTransaction } from "@/lib/payments";
import { sendPaymentReceiptEmail } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { renewTeamAccount } from "@/lib/teams";

export const TEAM_CHARGE_REF_PREFIX = "teamcharge:";

/** Formato de data exigido pelo MP (ISO com offset, ex.: 2026-06-12T15:00:00.000+00:00). */
function mpDate(date: Date): string {
  return date.toISOString().replace("Z", "+00:00");
}

export type PixPaymentResult = {
  id: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  raw: Record<string, unknown>;
};

/**
 * Cria um pagamento Pix via API de Payments do Mercado Pago (checkout transparente).
 * Retorna o QR Code (copia-e-cola + base64) para exibição na nossa própria página.
 */
export async function createPixPayment(input: {
  accessToken: string;
  amountCents: number;
  description: string;
  payer: { email: string; firstName?: string; lastName?: string; cpf?: string };
  externalReference: string;
  notificationUrl: string;
  expiresAt: Date;
}): Promise<PixPaymentResult> {
  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.accessToken}`,
      // Obrigatório na API de Payments: evita pagamentos duplicados em retry.
      "x-idempotency-key": crypto.randomUUID()
    },
    body: JSON.stringify({
      transaction_amount: Number((input.amountCents / 100).toFixed(2)),
      description: input.description,
      payment_method_id: "pix",
      payer: {
        email: input.payer.email,
        ...(input.payer.firstName ? { first_name: input.payer.firstName } : {}),
        ...(input.payer.lastName ? { last_name: input.payer.lastName } : {}),
        ...(input.payer.cpf ? { identification: { type: "CPF", number: input.payer.cpf } } : {})
      },
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      date_of_expiration: mpDate(input.expiresAt)
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message ?? `Mercado Pago retornou ${response.status} ao criar o pagamento Pix.`);
  }

  const tx = data?.point_of_interaction?.transaction_data ?? {};
  return {
    id: String(data.id),
    status: String(data.status ?? "pending"),
    qrCode: tx.qr_code ?? null,
    qrCodeBase64: tx.qr_code_base64 ?? null,
    ticketUrl: tx.ticket_url ?? null,
    raw: data
  };
}

/** Busca um pagamento no MP pelo id. Retorna null se a consulta falhar. */
export async function fetchMercadoPagoPayment(accessToken: string, paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payment = await response.json();
  if (!response.ok) return null;
  return payment as Record<string, unknown> & {
    id: number | string;
    status?: string;
    external_reference?: string;
  };
}

type MpPayment = NonNullable<Awaited<ReturnType<typeof fetchMercadoPagoPayment>>>;

function mpStatusToTransactionStatus(status: string | undefined): PaymentTransactionStatus {
  switch (status) {
    case "approved":
      return PaymentTransactionStatus.APPROVED;
    case "rejected":
      return PaymentTransactionStatus.REJECTED;
    case "cancelled":
      return PaymentTransactionStatus.CANCELED;
    case "refunded":
    case "charged_back":
      return PaymentTransactionStatus.REFUNDED;
    default:
      return PaymentTransactionStatus.PENDING;
  }
}

function approvedAt(payment: Record<string, unknown>): Date {
  const value = payment.date_approved;
  return value ? new Date(String(value)) : new Date();
}

export type ApplyPaymentResult =
  | { handled: "checkout"; approved: boolean }
  | { handled: "team_charge"; approved: boolean }
  | { handled: null };

/**
 * Aplica os efeitos de um pagamento MP no nosso domínio. Idempotente — usado
 * tanto pelo webhook quanto pelo polling das páginas Pix:
 * - external_reference = id de PaymentCheckoutSession → ativa assinatura do plano;
 * - external_reference = `teamcharge:{id}` → marca a cobrança e renova o pacote (+30d).
 */
export async function applyMercadoPagoPayment(payment: MpPayment): Promise<ApplyPaymentResult> {
  const ref = String(payment.external_reference ?? "");
  const approved = payment.status === "approved";

  // ── Cobrança avulsa de team (empresas) ──
  if (ref.startsWith(TEAM_CHARGE_REF_PREFIX)) {
    const chargeId = ref.slice(TEAM_CHARGE_REF_PREFIX.length);
    const charge = await prisma.teamCharge.findUnique({ where: { id: chargeId } });
    if (!charge) return { handled: null };

    const alreadyPaid = charge.status === PaymentTransactionStatus.APPROVED;
    const nextStatus = mpStatusToTransactionStatus(payment.status as string);
    if (charge.status !== nextStatus) {
      await prisma.teamCharge.update({
        where: { id: charge.id },
        data: {
          status: nextStatus,
          paidAt: approved ? approvedAt(payment) : charge.paidAt
        }
      });
    }
    // Renova o pacote só na primeira confirmação (renewTeamAccount estende a vigência).
    if (approved && !alreadyPaid) {
      await renewTeamAccount(charge.teamAccountId);
    }
    return { handled: "team_charge", approved };
  }

  // ── Checkout de assinatura individual ──
  const checkout = ref
    ? await prisma.paymentCheckoutSession.findUnique({ where: { id: ref }, include: { plan: true } })
    : null;
  if (!checkout) return { handled: null };

  // Só incrementa o uso do cupom na PRIMEIRA confirmação — o webhook/polling pode
  // reprocessar o mesmo pagamento várias vezes.
  const wasAlreadyCompleted = checkout.status === PaymentCheckoutStatus.COMPLETED;
  if (approved && !wasAlreadyCompleted && checkout.couponId) {
    await incrementCouponUsage(checkout.couponId);
  }

  await prisma.paymentCheckoutSession.update({
    where: { id: checkout.id },
    data: { status: approved ? PaymentCheckoutStatus.COMPLETED : PaymentCheckoutStatus.PENDING, metadata: payment as object }
  });
  await recordPaymentTransaction({
    userId: checkout.userId,
    planId: checkout.planId,
    checkoutSessionId: checkout.id,
    provider: PaymentProvider.MERCADO_PAGO,
    externalId: String(payment.id),
    status: approved ? PaymentTransactionStatus.APPROVED : PaymentTransactionStatus.PENDING,
    amountCents: Math.round(Number(payment.transaction_amount ?? checkout.amountCents / 100) * 100),
    paidAt: approved ? approvedAt(payment) : null,
    payload: payment
  });

  if (approved) {
    const endsAt = pixAccessEndsAt(approvedAt(payment));
    await activatePaidSubscription({
      userId: checkout.userId,
      planId: checkout.planId,
      provider: PaymentProvider.MERCADO_PAGO,
      externalId: String(payment.id),
      payload: payment,
      endsAt
    });
    await sendPaymentReceiptEmail({
      userId: checkout.userId,
      planId: checkout.planId,
      amountCents: Math.round(Number(payment.transaction_amount ?? checkout.amountCents / 100) * 100),
      provider: "MERCADO_PAGO",
      endsAt
    });
  }
  return { handled: "checkout", approved };
}
