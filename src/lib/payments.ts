import crypto from "crypto";
import { PaymentProvider, PaymentTransactionStatus, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export function appUrl() {
  // AUTH_URL serve de fallback porque já é obrigatório para o NextAuth em produção
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000";
}

export async function getPaymentSettings() {
  const settings =
    (await prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } })) ??
    (await prisma.paymentGatewaySetting.create({ data: { id: "default" } }));
  // Decifra os segredos para uso em runtime (texto puro legado passa direto).
  return {
    ...settings,
    stripeSecretKey: settings.stripeSecretKey ? decryptSecret(settings.stripeSecretKey) : settings.stripeSecretKey,
    stripeWebhookSecret: settings.stripeWebhookSecret ? decryptSecret(settings.stripeWebhookSecret) : settings.stripeWebhookSecret,
    mercadoPagoAccessToken: settings.mercadoPagoAccessToken ? decryptSecret(settings.mercadoPagoAccessToken) : settings.mercadoPagoAccessToken,
    mercadoPagoWebhookSecret: settings.mercadoPagoWebhookSecret ? decryptSecret(settings.mercadoPagoWebhookSecret) : settings.mercadoPagoWebhookSecret
  };
}

export async function activatePaidSubscription(input: {
  userId: string;
  planId: string;
  provider: PaymentProvider;
  externalId?: string | null;
  payload?: unknown;
  endsAt?: Date | null;
}) {
  await prisma.userSubscription.updateMany({
    where: { userId: input.userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() }
  });
  const subscription = await prisma.userSubscription.create({
    data: {
      userId: input.userId,
      planId: input.planId,
      status: SubscriptionStatus.ACTIVE,
      endsAt: input.endsAt ?? null
    }
  });
  await prisma.subscriptionEvent.create({
    data: {
      userId: input.userId,
      subscriptionId: subscription.id,
      provider: input.provider,
      type: SubscriptionEventType.PAID,
      externalId: input.externalId,
      payload: toJson(input.payload)
    }
  });

  // Compra pessoal (não vinda de pacote teams): se o usuário tinha plano cedido
  // por empresa, a vaga dele é revogada — evita que a renovação do pacote
  // rebaixe o plano que ele acabou de pagar e libera a vaga para outra pessoa.
  if (!input.externalId?.startsWith("team:")) {
    await prisma.teamSeat.updateMany({
      where: { userId: input.userId, status: "CLAIMED" },
      data: { status: "REVOKED" }
    });
  }

  return subscription;
}

export async function recordPaymentTransaction(input: {
  userId: string;
  planId: string;
  checkoutSessionId?: string | null;
  provider: PaymentProvider;
  externalId?: string | null;
  status: PaymentTransactionStatus;
  amountCents: number;
  paidAt?: Date | null;
  payload?: unknown;
}) {
  if (input.externalId) {
    return prisma.paymentTransaction.upsert({
      where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
      update: {
        status: input.status,
        paidAt: input.paidAt,
        rawPayload: toJson(input.payload)
      },
      create: {
        userId: input.userId,
        planId: input.planId,
        checkoutSessionId: input.checkoutSessionId,
        provider: input.provider,
        externalId: input.externalId,
        status: input.status,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        rawPayload: toJson(input.payload)
      }
    });
  }

  return prisma.paymentTransaction.create({
    data: {
      userId: input.userId,
      planId: input.planId,
      checkoutSessionId: input.checkoutSessionId,
      provider: input.provider,
      status: input.status,
      amountCents: input.amountCents,
      paidAt: input.paidAt,
      rawPayload: toJson(input.payload)
    }
  });
}

export function pixAccessEndsAt(from = new Date()) {
  const endsAt = new Date(from);
  endsAt.setDate(endsAt.getDate() + 30);
  return endsAt;
}

/**
 * Crédito proporcional ao tempo restante de uma assinatura com prazo (Pix, ciclo de 30 dias).
 * Usado para abater o valor já pago ao fazer upgrade de plano.
 */
export function remainingCreditCents(
  subscription: { endsAt: Date | null; plan: { priceCents: number } },
  cycleDays = 30
) {
  if (!subscription.endsAt) return 0;
  const msLeft = subscription.endsAt.getTime() - Date.now();
  if (msLeft <= 0) return 0;
  const daysLeft = Math.min(cycleDays, msLeft / 86_400_000);
  return Math.round(subscription.plan.priceCents * (daysLeft / cycleDays));
}

/** ID da assinatura no Stripe (sub_xxx) vinculada a uma assinatura local, se houver. */
export async function findStripeSubscriptionId(localSubscriptionId: string) {
  const event = await prisma.subscriptionEvent.findFirst({
    where: {
      subscriptionId: localSubscriptionId,
      provider: PaymentProvider.STRIPE,
      externalId: { startsWith: "sub_" }
    },
    orderBy: { createdAt: "desc" },
    select: { externalId: true }
  });
  return event?.externalId ?? null;
}

export function validateMercadoPagoSignature(input: {
  secret: string;
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  if (!input.signature || !input.requestId || !input.dataId) return false;
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    })
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
  const digest = crypto.createHmac("sha256", input.secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1 ?? ""));
  } catch {
    return false;
  }
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
