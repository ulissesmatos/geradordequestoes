import { redirect } from "next/navigation";
import Stripe from "stripe";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PaymentCheckoutStatus, PaymentProvider } from "@prisma/client";
import { Button } from "@/components/ui/button";
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
  if (!plan) {
    return <CheckoutError title="Plano não encontrado" message="Escolha um plano ativo na página de planos." />;
  }

  const settings = await getPaymentSettings();
  if (!settings.stripeSecretKey) {
    return <CheckoutError title="Stripe não configurado" message="Configure a chave secreta do Stripe no painel admin em Admin → Pagamentos." />;
  }
  if (!plan.stripePriceId) {
    return <CheckoutError title="Plano sem Price ID" message={`O plano "${plan.name}" não tem um Stripe Price ID configurado. Acesse Admin → Planos, edite o plano e adicione o Price ID (price_xxx) gerado no Stripe Dashboard.`} />;
  }

  try {
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
      : { customer_email: user.email ?? undefined };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...customerInput,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${appUrl()}/ai?checkout=success`,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return <CheckoutError title="Erro ao criar sessão de pagamento" message={message} />;
  }
}

function CheckoutError({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--warning)]">
            <AlertTriangle className="h-5 w-5" />
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">
              <ArrowLeft className="h-4 w-4" />
              Voltar para planos
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
