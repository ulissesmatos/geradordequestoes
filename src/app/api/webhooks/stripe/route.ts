import Stripe from "stripe";
import { PaymentCheckoutStatus, PaymentProvider, PaymentTransactionStatus, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { activatePaidSubscription, getPaymentSettings, recordPaymentTransaction } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey) return new Response("Stripe não configurado.", { status: 400 });
  const stripe = new Stripe(settings.stripeSecretKey);
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  let event: Stripe.Event;

  try {
    event = settings.stripeWebhookSecret && signature
      ? stripe.webhooks.constructEvent(rawBody, signature, settings.stripeWebhookSecret)
      : JSON.parse(rawBody);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Assinatura inválida.", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const checkoutSessionId = session.metadata?.checkoutSessionId;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (checkoutSessionId && userId && planId) {
      const checkout = await prisma.paymentCheckoutSession.update({
        where: { id: checkoutSessionId },
        data: { status: PaymentCheckoutStatus.COMPLETED, externalId: session.id }
      });
      if (typeof session.customer === "string") {
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: session.customer }
        });
      }
      await recordPaymentTransaction({
        userId,
        planId,
        checkoutSessionId: checkout.id,
        provider: PaymentProvider.STRIPE,
        externalId: session.payment_intent?.toString() || session.subscription?.toString() || session.id,
        status: PaymentTransactionStatus.APPROVED,
        amountCents: checkout.amountCents,
        paidAt: new Date(),
        payload: session
      });
      await activatePaidSubscription({
        userId,
        planId,
        provider: PaymentProvider.STRIPE,
        externalId: session.subscription?.toString() || session.id,
        payload: session
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId ?? (await findUserIdByExternalSubscription(subscription.id));
    if (userId) {
      await prisma.userSubscription.updateMany({
        where: { userId, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() }
      });
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          provider: PaymentProvider.STRIPE,
          type: SubscriptionEventType.CANCELED,
          externalId: subscription.id,
          payload: subscription as any
        }
      });
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId ?? (await findUserIdByExternalSubscription(subscription.id));
    if (userId) {
      const status = mapStripeSubscriptionStatus(subscription.status);
      if (status) {
        await prisma.userSubscription.updateMany({
          where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
          data: { status, endsAt: status === SubscriptionStatus.CANCELED ? new Date() : undefined }
        });
      }
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          provider: PaymentProvider.STRIPE,
          type: status === SubscriptionStatus.PAST_DUE ? SubscriptionEventType.PAST_DUE : SubscriptionEventType.UPDATED,
          externalId: subscription.id,
          payload: subscription as any
        }
      });
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;
    const local = subscriptionId
      ? await prisma.subscriptionEvent.findFirst({
          where: { externalId: subscriptionId },
          include: { subscription: true },
          orderBy: { createdAt: "desc" }
        })
      : null;
    if (local?.subscription) {
      await prisma.userSubscription.update({
        where: { id: local.subscription.id },
        data: { status: SubscriptionStatus.ACTIVE }
      });
      await recordPaymentTransaction({
        userId: local.userId,
        planId: local.subscription.planId,
        provider: PaymentProvider.STRIPE,
        externalId: invoice.id,
        status: PaymentTransactionStatus.APPROVED,
        amountCents: invoice.amount_paid ?? 0,
        paidAt: new Date(),
        payload: invoice
      });
      await prisma.subscriptionEvent.create({
        data: {
          userId: local.userId,
          subscriptionId: local.subscription.id,
          provider: PaymentProvider.STRIPE,
          type: SubscriptionEventType.PAID,
          externalId: subscriptionId,
          payload: invoice as any
        }
      });
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;
    const active = subscriptionId
      ? await prisma.subscriptionEvent.findFirst({ where: { externalId: subscriptionId }, include: { subscription: true }, orderBy: { createdAt: "desc" } })
      : null;
    if (active?.userId) {
      await prisma.userSubscription.updateMany({
        where: { userId: active.userId, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.PAST_DUE }
      });
      await prisma.subscriptionEvent.create({
        data: {
          userId: active.userId,
          subscriptionId: active.subscription?.id,
          provider: PaymentProvider.STRIPE,
          type: SubscriptionEventType.PAST_DUE,
          externalId: subscriptionId,
          payload: invoice as any
        }
      });
    }
  }

  return Response.json({ received: true });
}

async function findUserIdByExternalSubscription(externalId: string) {
  const event = await prisma.subscriptionEvent.findFirst({
    where: { provider: PaymentProvider.STRIPE, externalId },
    select: { userId: true },
    orderBy: { createdAt: "desc" }
  });
  return event?.userId ?? null;
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing") return SubscriptionStatus.ACTIVE;
  if (status === "past_due" || status === "unpaid") return SubscriptionStatus.PAST_DUE;
  if (status === "canceled") return SubscriptionStatus.CANCELED;
  return null;
}
