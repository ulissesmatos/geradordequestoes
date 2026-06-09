import crypto from "crypto";
import { PaymentProvider, PaymentTransactionStatus, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

export async function getPaymentSettings() {
  return (
    (await prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } })) ??
    (await prisma.paymentGatewaySetting.create({ data: { id: "default" } }))
  );
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
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1));
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
