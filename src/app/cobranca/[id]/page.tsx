import { notFound } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";
import { PaymentTransactionStatus } from "@prisma/client";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppSettings } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Página pública (link compartilhável) de cobrança Pix para empresas (teams). */
export default async function CobrancaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [charge, appSettings] = await Promise.all([
    prisma.teamCharge.findUnique({
      where: { id },
      include: { teamAccount: { select: { name: true } } }
    }),
    getAppSettings()
  ]);
  if (!charge) notFound();

  const paid = charge.status === PaymentTransactionStatus.APPROVED;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={appSettings.logoUrl} appName={appSettings.appName} sticky={false} />

      <section className="mx-auto max-w-xl px-4 py-10 md:py-14">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[var(--primary)]" />
              <CardTitle>Cobrança — {charge.teamAccount.name}</CardTitle>
            </div>
            <CardDescription>
              Pagamento do pacote de assinaturas em grupo via Pix.
              {charge.expiresAt && !paid ? ` Válido até ${formatDate(charge.expiresAt)}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paid ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <h2 className="text-xl font-semibold text-emerald-800">Pagamento confirmado!</h2>
                <p className="text-sm text-emerald-700">
                  O pacote foi renovado e os acessos da equipe já estão ativos. Obrigado!
                </p>
              </div>
            ) : (
              <PixPaymentPanel
                amountCents={charge.amountCents}
                qrCode={charge.pixQrCode}
                qrCodeBase64={charge.pixQrCodeBase64}
                expiresAt={charge.expiresAt?.toISOString() ?? null}
                statusUrl={`/cobranca/${charge.id}/status`}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <SiteFooter logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
    </main>
  );
}
