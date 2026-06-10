import { redirect } from "next/navigation";
import Stripe from "stripe";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PaymentCheckoutStatus, PaymentProvider } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { appUrl, findStripeSubscriptionId, getPaymentSettings, remainingCreditCents, activatePaidSubscription } from "@/lib/payments";
import { getActiveSubscription } from "@/lib/subscriptions";
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

  // Trava de assinatura dupla: com plano ativo, só permitimos upgrade.
  const activeSubscription = await getActiveSubscription(user.id);
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
          message={`Você assina o plano ${activeSubscription.plan.name}. Só é possível fazer upgrade para um plano superior. Para reduzir o plano, cancele a assinatura atual em Perfil → Gerenciar pagamento e assine o novo plano depois.`}
        />
      );
    }
  }

  try {
    const stripe = new Stripe(settings.stripeSecretKey);

    // Upgrade de assinatura recorrente existente: troca o preço na própria
    // assinatura do Stripe com proração (crédito do período não usado é
    // abatido na fatura imediata do novo plano).
    if (activeSubscription) {
      const stripeSubscriptionId = await findStripeSubscriptionId(activeSubscription.id);
      if (stripeSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (["active", "trialing", "past_due"].includes(stripeSubscription.status)) {
          await stripe.subscriptions.update(stripeSubscriptionId, {
            items: [{ id: stripeSubscription.items.data[0].id, price: plan.stripePriceId }],
            proration_behavior: "always_invoice",
            // Se a cobrança da diferença falhar, nada muda e mostramos o erro.
            payment_behavior: "error_if_incomplete",
            metadata: { userId: user.id, planId: plan.id }
          });
          await activatePaidSubscription({
            userId: user.id,
            planId: plan.id,
            provider: PaymentProvider.STRIPE,
            externalId: stripeSubscriptionId,
            payload: { upgradeFrom: activeSubscription.planId, upgradeTo: plan.id }
          });
          redirect("/perfil?upgrade=success");
        }
      }
    }

    const localCheckout = await prisma.paymentCheckoutSession.create({
      data: {
        userId: user.id,
        planId: plan.id,
        provider: PaymentProvider.STRIPE,
        amountCents: plan.priceCents
      }
    });

    const customerInput = user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email ?? undefined };

    // Upgrade vindo de assinatura Pix (prazo fixo): abate o valor proporcional
    // restante como cupom de uso único na primeira fatura.
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (activeSubscription) {
      const credit = Math.min(remainingCreditCents(activeSubscription), plan.priceCents - 100);
      if (credit > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: credit,
          currency: "brl",
          duration: "once",
          name: `Crédito do plano ${activeSubscription.plan.name}`
        });
        discounts = [{ coupon: coupon.id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...customerInput,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      ...(discounts ? { discounts } : {}),
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
    // redirect() throws a special Next.js internal error — must re-throw it
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
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
