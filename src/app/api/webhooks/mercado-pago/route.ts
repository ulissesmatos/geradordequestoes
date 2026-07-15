import { getPaymentSettings, validateMercadoPagoSignature } from "@/lib/payments";
import { applyMercadoPagoPayment, fetchMercadoPagoPayment } from "@/lib/mercado-pago";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const settings = await getPaymentSettings();
    if (!settings.mercadoPagoAccessToken) return new Response("Mercado Pago não configurado.", { status: 400 });

    // Fail closed: sem o secret configurado, qualquer um poderia forjar webhooks
    // e ativar assinaturas. Configure o segredo do webhook no painel admin.
    if (!settings.mercadoPagoWebhookSecret) {
      console.error("[mp-webhook] Webhook recebido sem mercadoPagoWebhookSecret configurado — rejeitado.");
      return new Response("Webhook não configurado.", { status: 503 });
    }

    const url = new URL(request.url);
    const queryDataId = url.searchParams.get("data.id");
    const body = await request.json().catch(() => ({}));
    const dataId = queryDataId || body?.data?.id || body?.id;

    const valid = validateMercadoPagoSignature({
      secret: settings.mercadoPagoWebhookSecret,
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId
    });
    if (!valid) return new Response("Assinatura inválida.", { status: 401 });

    if (!dataId) return Response.json({ received: true });

    const payment = await fetchMercadoPagoPayment(settings.mercadoPagoAccessToken, String(dataId));
    if (!payment) return Response.json({ received: true, ignored: "payment_not_found" });

    const result = await applyMercadoPagoPayment(payment);
    if (!result.handled) return Response.json({ received: true, ignored: "reference_not_found" });

    return Response.json({ received: true, handled: result.handled, approved: result.approved });
  } catch (err) {
    console.error("[mp-webhook]", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
