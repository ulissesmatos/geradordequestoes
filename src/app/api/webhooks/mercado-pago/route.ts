import { PaymentCheckoutStatus, PaymentProvider, PaymentTransactionStatus } from "@prisma/client";
import { activatePaidSubscription, getPaymentSettings, pixAccessEndsAt, recordPaymentTransaction, validateMercadoPagoSignature } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const settings = await getPaymentSettings();
  if (!settings.mercadoPagoAccessToken) return new Response("Mercado Pago não configurado.", { status: 400 });

  const url = new URL(request.url);
  const queryDataId = url.searchParams.get("data.id");
  const body = await request.json().catch(() => ({}));
  const dataId = queryDataId || body?.data?.id || body?.id;

  if (settings.mercadoPagoWebhookSecret) {
    const valid = validateMercadoPagoSignature({
      secret: settings.mercadoPagoWebhookSecret,
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId
    });
    if (!valid) return new Response("Assinatura inválida.", { status: 401 });
  }

  if (!dataId) return Response.json({ received: true });

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { authorization: `Bearer ${settings.mercadoPagoAccessToken}` }
  });
  const payment = await paymentResponse.json();
  if (!paymentResponse.ok) return new Response(payment.message ?? "Erro ao consultar pagamento.", { status: 400 });

  const checkoutId = payment.external_reference;
  const checkout = checkoutId
    ? await prisma.paymentCheckoutSession.findUnique({ where: { id: checkoutId }, include: { plan: true } })
    : null;
  if (!checkout) return Response.json({ received: true, ignored: "checkout_not_found" });

  const approved = payment.status === "approved";
  await prisma.paymentCheckoutSession.update({
    where: { id: checkout.id },
    data: { status: approved ? PaymentCheckoutStatus.COMPLETED : PaymentCheckoutStatus.PENDING, metadata: payment }
  });
  await recordPaymentTransaction({
    userId: checkout.userId,
    planId: checkout.planId,
    checkoutSessionId: checkout.id,
    provider: PaymentProvider.MERCADO_PAGO,
    externalId: String(payment.id),
    status: approved ? PaymentTransactionStatus.APPROVED : PaymentTransactionStatus.PENDING,
    amountCents: Math.round(Number(payment.transaction_amount ?? checkout.amountCents / 100) * 100),
    paidAt: approved ? new Date(payment.date_approved ?? Date.now()) : null,
    payload: payment
  });

  if (approved) {
    await activatePaidSubscription({
      userId: checkout.userId,
      planId: checkout.planId,
      provider: PaymentProvider.MERCADO_PAGO,
      externalId: String(payment.id),
      payload: payment,
      endsAt: pixAccessEndsAt(new Date(payment.date_approved ?? Date.now()))
    });
  }

  return Response.json({ received: true });
}
