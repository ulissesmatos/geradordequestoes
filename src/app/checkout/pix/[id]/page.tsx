import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";
import { PaymentCheckoutStatus } from "@prisma/client";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

type PixMetadata = {
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export default async function PixCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const checkout = await prisma.paymentCheckoutSession.findUnique({
    where: { id },
    include: { plan: { select: { name: true } } }
  });
  if (!checkout || checkout.userId !== user.id) notFound();
  if (checkout.status === PaymentCheckoutStatus.COMPLETED) redirect("/ai?checkout=success");

  const metadata = (checkout.metadata ?? {}) as PixMetadata;
  const tx = metadata.point_of_interaction?.transaction_data;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-[var(--primary)]" />
            <CardTitle>Pague com Pix</CardTitle>
          </div>
          <CardDescription>
            Plano <strong>{checkout.plan.name}</strong> — assim que o pagamento for aprovado, seu acesso é liberado
            automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tx?.qr_code || tx?.qr_code_base64 ? (
            <PixPaymentPanel
              amountCents={checkout.amountCents}
              qrCode={tx?.qr_code ?? null}
              qrCodeBase64={tx?.qr_code_base64 ?? null}
              expiresAt={checkout.expiresAt?.toISOString() ?? null}
              statusUrl={`/checkout/pix/${checkout.id}/status`}
              successRedirect="/ai?checkout=success"
            />
          ) : (
            <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
              Não foi possível carregar o QR Code deste pagamento. Volte para os planos e tente novamente.
            </p>
          )}
          <Button asChild variant="ghost" size="sm">
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
