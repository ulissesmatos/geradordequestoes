import { redirect } from "next/navigation";
import { PaymentProvider } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { appUrl, getPaymentSettings } from "@/lib/payments";
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

  const localCheckout = await prisma.paymentCheckoutSession.create({
    data: {
      userId: user.id,
      planId: plan.id,
      provider: PaymentProvider.MERCADO_PAGO,
      amountCents: plan.priceCents,
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
          title: plan.name,
          quantity: 1,
          unit_price: plan.priceCents / 100,
          currency_id: "BRL"
        }
      ],
      payer: { email: user.email },
      external_reference: localCheckout.id,
      notification_url: `${appUrl()}/api/webhooks/mercado-pago`,
      back_urls: {
        success: `${appUrl()}/dashboard?checkout=success`,
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
