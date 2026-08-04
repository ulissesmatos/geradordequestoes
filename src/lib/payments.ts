import crypto from "crypto";
import Stripe from "stripe";
import { PaymentProvider, PaymentTransactionStatus, SubscriptionCancelReason, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
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
  // SUPERSEDED, não perda de cliente: essa função sempre roda porque uma assinatura NOVA está
  // sendo ativada pro mesmo usuário (renovação, upgrade, primeira compra depois do trial) —
  // nunca deve contar como churn.
  await prisma.userSubscription.updateMany({
    where: { userId: input.userId, status: SubscriptionStatus.ACTIVE },
    data: { status: SubscriptionStatus.CANCELED, endsAt: new Date(), cancelReason: SubscriptionCancelReason.SUPERSEDED }
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
 *
 * `respectCancelMode` (default false, propositalmente): só quando true é que
 * PaymentGatewaySetting.stripeCancelMode = AT_PERIOD_END faz isso usar
 * `cancel_at_period_end` em vez de cancelar na hora — e nesse caso a assinatura entra em
 * `deferredIds` (ainda ACTIVE no Stripe até o período acabar; quem chamou NÃO deve marcar
 * CANCELED localmente ainda, isso é papel do webhook customer.subscription.deleted quando o
 * período realmente terminar). Deixado false por padrão porque activateUserSubscriptionAction
 * usa esta função pra encerrar uma assinatura Stripe ANTIGA ao ativar uma NOVA na hora — adiar
 * esse cancelamento cobraria a assinatura antiga em paralelo com a nova (cobrança duplicada).
 */
export async function cancelLinkedStripeSubscriptions(
  localSubscriptionIds: string[],
  options: { respectCancelMode?: boolean } = {}
): Promise<{ errors: string[]; deferredIds: string[] }> {
  const errors: string[] = [];
  const deferredIds: string[] = [];
  const uniqueIds = [...new Set(localSubscriptionIds)];
  if (uniqueIds.length === 0) return { errors, deferredIds };

  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey) return { errors, deferredIds };
  const stripe = new Stripe(settings.stripeSecretKey);
  const atPeriodEnd = Boolean(options.respectCancelMode) && settings.stripeCancelMode === "AT_PERIOD_END";

  for (const subscriptionId of uniqueIds) {
    const stripeSubId = await findStripeSubscriptionId(subscriptionId);
    if (!stripeSubId) continue;
    try {
      if (atPeriodEnd) {
        await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
        deferredIds.push(subscriptionId);
      } else {
        await stripe.subscriptions.cancel(stripeSubId);
      }
    } catch (error) {
      errors.push(`${stripeSubId}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }
  return { errors, deferredIds };
}

/**
 * Sincroniza cancelMode/prorationBehavior (PaymentGatewaySetting) com a billingPortal.configuration
 * da Stripe — é isso que efetivamente muda o comportamento do portal self-service do cliente
 * (checkout/stripe/portal/page.tsx não muda: ele só abre a sessão, a config é que manda).
 *
 * Atualiza a configuração EXISTENTE (a que já salvamos, ou a default da conta) em vez de criar
 * uma do zero, pra preservar outros recursos do portal (atualizar cartão, histórico de faturas
 * etc.) que o admin possa já ter configurado direto no Dashboard da Stripe — criar do zero
 * desligaria tudo isso silenciosamente.
 */
export async function syncStripePortalPolicy(input: {
  stripe: Stripe;
  cancelMode: "IMMEDIATE" | "AT_PERIOD_END";
  prorationBehavior: "NONE" | "CREATE_PRORATIONS";
  existingConfigurationId: string | null;
}): Promise<string> {
  const { stripe } = input;
  const cancelStripeMode = input.cancelMode === "AT_PERIOD_END" ? ("at_period_end" as const) : ("immediately" as const);
  const updateProration = input.prorationBehavior === "CREATE_PRORATIONS" ? ("create_prorations" as const) : ("none" as const);
  // A Stripe rejeita/ignora proração em cancelamento agendado pro fim do período — só é válida
  // com mode "immediately". Ver docs do parâmetro subscription_cancel.proration_behavior.
  const cancelProration = cancelStripeMode === "immediately" ? updateProration : ("none" as const);

  // Planos com preço Stripe configurado são o que popula "trocar de plano" no portal.
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true, stripePriceId: { not: null } }
  });
  const products = await Promise.all(
    plans.map(async (plan) => {
      const price = await stripe.prices.retrieve(plan.stripePriceId as string);
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      return { product: productId, prices: [plan.stripePriceId as string] };
    })
  );

  const existing = input.existingConfigurationId
    ? await stripe.billingPortal.configurations.retrieve(input.existingConfigurationId).catch(() => null)
    : ((await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0] ?? null);

  const features = {
    ...(existing
      ? {
          customer_update: existing.features.customer_update,
          invoice_history: existing.features.invoice_history,
          payment_method_update: existing.features.payment_method_update
        }
      : {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          customer_update: { enabled: true, allowed_updates: ["email" as const] }
        }),
    subscription_cancel: {
      enabled: true,
      mode: cancelStripeMode,
      proration_behavior: cancelProration
    },
    subscription_update: {
      enabled: products.length > 0,
      default_allowed_updates: ["price" as const],
      proration_behavior: updateProration,
      products
    }
  };

  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, { features });
    return updated.id;
  }
  // Sem configuração prévia (conta nova, nunca customizada no Dashboard): cria uma do zero.
  const created = await stripe.billingPortal.configurations.create({ features });
  return created.id;
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
