import { redirect } from "next/navigation";
import Stripe from "stripe";
import { PaymentCheckoutStatus, PaymentProvider } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { appUrl, getPaymentSettings } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export default async function StripeCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const { plan: planSlug } = await searchParams;
  const plan = planSlug
    ? await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug, isActive: true } })
    : null;
  if (!plan) return <CheckoutError title="Plano não encontrado" message="Escolha um plano ativo na página de planos." />;

  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey || !plan.stripePriceId) {
    return <CheckoutError title="Stripe não configurado" message="Configure a chave Stripe e o Price ID do plano no painel admin." />;
  }

  const localCheckout = await prisma.paymentCheckoutSession.create({
    data: {
      userId: user.id,
      planId: plan.id,
      provider: PaymentProvider.STRIPE,
      amountCents: plan.priceCents
    }
  });
  const stripe = new Stripe(settings.stripeSecretKey);
  const customerInput = user.stripeCustomerId
    ? { customer: user.stripeCustomerId }
    : { customer_email: user.email };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...customerInput,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${appUrl()}/dashboard?checkout=success`,
    cancel_url: `${appUrl()}/pricing?checkout=cancel`,
    metadata: {
      userId: user.id,
      planId: plan.id,
      checkoutSessionId: localCheckout.id
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        planId: plan.id,
        checkoutSessionId: localCheckout.id
      }
    }
  });
  await prisma.paymentCheckoutSession.update({
    where: { id: localCheckout.id },
    data: {
      externalId: session.id,
      checkoutUrl: session.url,
      status: PaymentCheckoutStatus.PENDING
    }
  });
  redirect(session.url ?? "/pricing");
}

function CheckoutError({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">{message}</CardContent>
      </Card>
    </main>
  );
}
