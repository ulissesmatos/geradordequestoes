import { PaymentTransactionStatus } from "@prisma/client";
import { applyMercadoPagoPayment, fetchMercadoPagoPayment } from "@/lib/mercado-pago";
import { getPaymentSettings } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Polling público da cobrança Pix de team. O id (cuid) funciona como token de
 * acesso — só expõe o status. Consulta o MP como fallback do webhook.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = await prisma.teamCharge.findUnique({ where: { id } });
  if (!charge) return Response.json({ status: "not_found" }, { status: 404 });

  if (charge.status === PaymentTransactionStatus.APPROVED) {
    return Response.json({ status: "approved" });
  }

  if (charge.externalId) {
    try {
      const settings = await getPaymentSettings();
      if (settings.mercadoPagoAccessToken) {
        const payment = await fetchMercadoPagoPayment(settings.mercadoPagoAccessToken, charge.externalId);
        if (payment) {
          const result = await applyMercadoPagoPayment(payment);
          if (result.handled && result.approved) return Response.json({ status: "approved" });
        }
      }
    } catch (err) {
      console.error("[cobranca-status]", err);
    }
  }

  return Response.json({ status: "pending" });
}
