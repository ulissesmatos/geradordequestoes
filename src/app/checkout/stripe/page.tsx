import { redirect } from "next/navigation";
import Stripe from "stripe";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PaymentCheckoutStatus, PaymentProvider, PaymentTransactionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { validateCoupon } from "@/lib/coupons";
import { appUrl, findStripeSubscriptionId, getPaymentSettings, remainingCreditCents, activatePaidSubscription, recordPaymentTransaction } from "@/lib/payments";
import { getActiveSubscription } from "@/lib/subscriptions";
import { isTeamGrantedPlan } from "@/lib/teams";
import { prisma } from "@/lib/prisma";

export default async function StripeCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; coupon?: string }> }) {
  const user = await requireUser();
  const { plan: planSlug, coupon: couponCode } = await searchParams;

  const plan = planSlug
    ? await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug, isActive: true } })
    : null;
  if (!plan) {
    return <CheckoutError title="Plano não encontrado" message="Escolha um plano ativo na página de planos." />;
  }

  // Revalida o cupom no servidor (nunca confia no valor mostrado no modal do cliente).
  // Código inválido/expirado aqui é ignorado silenciosamente: o cliente já viu o erro
  // no preview do modal antes de chegar neste link.
  let couponId: string | undefined;
  let couponDiscountCents = 0;
  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, plan.priceCents);
    if (couponResult.ok) {
      couponId = couponResult.coupon.id;
      couponDiscountCents = couponResult.discountCents;
    }
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
          const updatedSub = await stripe.subscriptions.update(stripeSubscriptionId, {
            items: [{ id: stripeSubscription.items.data[0].id, price: plan.stripePriceId }],
            proration_behavior: "always_invoice",
            // Se a cobrança da diferença falhar, nada muda e mostramos o erro.
            payment_behavior: "error_if_incomplete",
            expand: ["latest_invoice"],
            metadata: { userId: user.id, planId: plan.id }
          });

          await activatePaidSubscription({
            userId: user.id,
            planId: plan.id,
            provider: PaymentProvider.STRIPE,
            externalId: stripeSubscriptionId,
            payload: { upgradeFrom: activeSubscription.planId, upgradeTo: plan.id }
          });

          // Registra a transação inline para não depender exclusivamente do webhook
          // invoice.paid (que pode chegar com race condition antes de activatePaidSubscription).
          const invoice = typeof updatedSub.latest_invoice === "object" && updatedSub.latest_invoice
            ? updatedSub.latest_invoice as Stripe.Invoice
            : null;
          if (invoice?.id && (invoice.amount_paid ?? 0) >= 0) {
            await recordPaymentTransaction({
              userId: user.id,
              planId: plan.id,
              provider: PaymentProvider.STRIPE,
              externalId: invoice.id,
              status: PaymentTransactionStatus.APPROVED,
              amountCents: invoice.amount_paid ?? 0,
              paidAt: invoice.status_transitions?.paid_at
                ? new Date(invoice.status_transitions.paid_at * 1000)
                : new Date(),
              payload: invoice
            });
          }

          redirect("/perfil?upgrade=success");
        }
      }
    }

    const localCheckout = await prisma.paymentCheckoutSession.create({
      data: {
        userId: user.id,
        planId: plan.id,
        provider: PaymentProvider.STRIPE,
        amountCents: plan.priceCents - couponDiscountCents,
        couponId,
        discountCents: couponDiscountCents || undefined
      }
    });

    // Pré-cria o Customer com nome/telefone/CPF para autofill no checkout e
    // dados fiscais; reutiliza o existente nas próximas vezes.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        ...(user.name ? { name: user.name } : {}),
        ...(user.phone ? { phone: user.phone } : {}),
        metadata: { userId: user.id, ...(user.cpf ? { cpf: user.cpf } : {}) }
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }
    const customerInput = { customer: customerId };

    // Upgrade vindo de assinatura Pix (prazo fixo): abate o valor proporcional
    // restante como cupom de uso único na primeira fatura.
    // Exceção: plano cedido por empresa (teams) não gera crédito — quem pagou
    // foi a empresa. O assinante paga o valor cheio e sai do pacote (a vaga é
    // revogada automaticamente em activatePaidSubscription).
    const teamGranted = activeSubscription ? await isTeamGrantedPlan(user.id, activeSubscription.planId) : false;
    const upgradeCreditCents =
      activeSubscription && !teamGranted ? Math.min(remainingCreditCents(activeSubscription), plan.priceCents - 100) : 0;

    // Crédito de upgrade e cupom digitado pelo cliente viram UM único desconto de uso
    // único na Stripe (a Checkout Session só aceita um desconto por sessão).
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    const totalDiscountCents = upgradeCreditCents + couponDiscountCents;
    if (totalDiscountCents > 0) {
      const nameParts = [
        upgradeCreditCents > 0 ? `Crédito do plano ${activeSubscription?.plan.name}` : "",
        couponId ? `Cupom ${couponCode?.trim().toUpperCase()}` : ""
      ].filter(Boolean);
      const stripeCoupon = await stripe.coupons.create({
        amount_off: Math.min(totalDiscountCents, plan.priceCents - 100),
        currency: "brl",
        duration: "once",
        name: nameParts.join(" + ")
      });
      discounts = [{ coupon: stripeCoupon.id }];
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
        checkoutSessionId: localCheckout.id,
        ...(couponId ? { couponId } : {})
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId: plan.id,
          checkoutSessionId: localCheckout.id,
          ...(couponId ? { couponId } : {})
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
