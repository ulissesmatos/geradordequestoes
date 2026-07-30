import crypto from "crypto";
import Stripe from "stripe";
import { PaymentProvider, PaymentTransactionStatus, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { recordAffiliateCommission } from "@/lib/affiliates";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export function appUrl() {
  // AUTH_URL serve de fallback porque já é obrigatório para o NextAuth em produção
  const url =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000";
  // Remove barra(s) finais para evitar "//" ao concatenar com o path (ex.: `${appUrl()}/r/${code}`)
  return url.replace(/\/+$/, "");
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
  // Só entra no caixa dinheiro que passou por um gateway. MANUAL é cortesia/liberação feita
  // pelo admin: registra a transação para o histórico, mas fora do total de receita.
  // O admin ainda pode virar a chave à mão em Admin → Pagamentos; por isso o campo não é
  // recalculado no update do upsert (webhook repetido não desfaz a decisão dele).
  const countsAsRevenue = input.provider !== PaymentProvider.MANUAL;

  const transaction = input.externalId
    ? await prisma.paymentTransaction.upsert({
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
          countsAsRevenue,
          rawPayload: toJson(input.payload)
        }
      })
    : await prisma.paymentTransaction.create({
        data: {
          userId: input.userId,
          planId: input.planId,
          checkoutSessionId: input.checkoutSessionId,
          provider: input.provider,
          status: input.status,
          amountCents: input.amountCents,
          paidAt: input.paidAt,
          countsAsRevenue,
          rawPayload: toJson(input.payload)
        }
      });

  // Comissão de afiliado em pagamento aprovado (idempotente e best-effort).
  await recordAffiliateCommission(transaction);

  return transaction;
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

/**
 * Cancela no Stripe as assinaturas recorrentes vinculadas às assinaturas locais informadas.
 * Sem isso, cancelar/trocar de plano só localmente deixa a assinatura Stripe cobrando —
 * a próxima fatura paga (invoice.paid) reativa a linha local, "desfazendo" o cancelamento.
 * Best-effort: erro ao cancelar uma (ex.: já cancelada no Stripe) não interrompe as demais
 * nem o cancelamento local — só volta na lista de erros para quem chamou decidir se avisa o admin.
 */
export async function cancelLinkedStripeSubscriptions(localSubscriptionIds: string[]): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const uniqueIds = [...new Set(localSubscriptionIds)];
  if (uniqueIds.length === 0) return { errors };

  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey) return { errors };
  const stripe = new Stripe(settings.stripeSecretKey);

  for (const subscriptionId of uniqueIds) {
    const stripeSubId = await findStripeSubscriptionId(subscriptionId);
    if (!stripeSubId) continue;
    try {
      await stripe.subscriptions.cancel(stripeSubId);
    } catch (error) {
      errors.push(`${stripeSubId}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }
  return { errors };
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
