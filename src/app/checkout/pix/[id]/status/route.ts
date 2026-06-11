import { PaymentCheckoutStatus } from "@prisma/client";
import { auth } from "@/auth";
import { applyMercadoPagoPayment, fetchMercadoPagoPayment } from "@/lib/mercado-pago";
import { getPaymentSettings } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Polling do checkout Pix transparente. Além de ler o status local (atualizado
 * pelo webhook), consulta o MP diretamente — cobre o caso de webhook atrasado
 * ou não configurado.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ status: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const checkout = await prisma.paymentCheckoutSession.findUnique({ where: { id } });
  if (!checkout || checkout.userId !== session.user.id) {
    return Response.json({ status: "not_found" }, { status: 404 });
  }
  if (checkout.status === PaymentCheckoutStatus.COMPLETED) {
    return Response.json({ status: "approved" });
  }

  // Confere direto no MP (fallback do webhook).
  if (checkout.externalId) {
    try {
      const settings = await getPaymentSettings();
      if (settings.mercadoPagoAccessToken) {
        const payment = await fetchMercadoPagoPayment(settings.mercadoPagoAccessToken, checkout.externalId);
        if (payment) {
          const result = await applyMercadoPagoPayment(payment);
          if (result.handled && result.approved) return Response.json({ status: "approved" });
          if (payment.status === "rejected" || payment.status === "cancelled") {
            return Response.json({ status: String(payment.status) });
          }
        }
      }
    } catch (err) {
      console.error("[pix-status]", err);
    }
  }

  return Response.json({ status: "pending" });
}
