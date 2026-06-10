import { redirect } from "next/navigation";
import { PaymentProvider } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { appUrl, findStripeSubscriptionId, getPaymentSettings, remainingCreditCents } from "@/lib/payments";
import { getActiveSubscription } from "@/lib/subscriptions";
import { prisma } from "@/lib/prisma";

export default async function MercadoPagoCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const { plan: planSlug } = await searchParams;
  const plan = planSlug
    ? await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug, isActive: true } })
    : null;
  if (!plan) return <CheckoutError title="Plano não encontrado" message="Escolha um plano ativo na página de planos." />;

  const settings = await getPaymentSettings();
  if (!settings.mercadoPagoAccessToken) {
    return <CheckoutError title="Mercado Pago não configurado" message="Configure o Access Token do Mercado Pago no painel admin." />;
  }

  // Trava de assinatura dupla: com plano ativo, só permitimos upgrade.
  const activeSubscription = await getActiveSubscription(user.id);
  let amountCents = plan.priceCents;
  if (activeSubscription) {
    if (activeSubscription.planId === plan.id) {
      return (
        <CheckoutError
          title="Você já assina este plano"
          message={`Sua assinatura do plano ${plan.name} está ativa. Não é possível assinar o mesmo plano duas vezes.`}
        />
      );
    }
    if (plan.priceCents <= activeSubscription.plan.priceCents) {
      return (
        <CheckoutError
          title="Downgrade indisponível"
          message={`Você assina o plano ${activeSubscription.plan.name}. Só é possível fazer upgrade para um plano superior. Para reduzir o plano, cancele a assinatura atual primeiro.`}
        />
      );
    }
    // Assinatura recorrente no cartão: pagar via Pix não interrompe a cobrança
    // do Stripe — o upgrade precisa acontecer na própria assinatura do cartão.
    const stripeSubscriptionId = await findStripeSubscriptionId(activeSubscription.id);
    if (stripeSubscriptionId) {
      return (
        <CheckoutError
          title="Use o cartão para fazer upgrade"
          message="Sua assinatura atual é recorrente no cartão. Para trocar de plano, escolha pagar com cartão: o upgrade é aplicado na própria assinatura, com o valor já pago abatido automaticamente."
        />
      );
    }
    // Upgrade Pix → Pix: abate o valor proporcional restante da assinatura atual.
    const credit = remainingCreditCents(activeSubscription);
    amountCents = Math.max(plan.priceCents - credit, 100);
  }

  const localCheckout = await prisma.paymentCheckoutSession.create({
    data: {
      userId: user.id,
      planId: plan.id,
      provider: PaymentProvider.MERCADO_PAGO,
      amountCents,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }
  });
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.mercadoPagoAccessToken}`
    },
    body: JSON.stringify({
      items: [
        {
          title: amountCents < plan.priceCents ? `${plan.name} (upgrade com crédito do plano atual)` : plan.name,
          quantity: 1,
          unit_price: amountCents / 100,
          currency_id: "BRL"
        }
      ],
      payer: { email: user.email },
      external_reference: localCheckout.id,
      notification_url: `${appUrl()}/api/webhooks/mercado-pago`,
      back_urls: {
        success: `${appUrl()}/ai?checkout=success`,
        failure: `${appUrl()}/pricing?checkout=failure`,
        pending: `${appUrl()}/assinatura?checkout=pending`
      },
      payment_methods: {
        excluded_payment_types: [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "ticket" }
        ],
        installments: 1
      }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    return <CheckoutError title="Erro no Mercado Pago" message={data.message ?? "Não foi possível criar o checkout Pix."} />;
  }
  await prisma.paymentCheckoutSession.update({
    where: { id: localCheckout.id },
    data: {
      externalId: data.id,
      checkoutUrl: data.init_point ?? data.sandbox_init_point,
      metadata: data
    }
  });
  redirect(data.init_point ?? data.sandbox_init_point ?? "/pricing");
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
