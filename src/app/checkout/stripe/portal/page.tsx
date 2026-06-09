import { redirect } from "next/navigation";
import Stripe from "stripe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { appUrl, getPaymentSettings } from "@/lib/payments";

export default async function StripePortalPage() {
  const user = await requireUser();
  const settings = await getPaymentSettings();

  if (!settings.stripePortalEnabled || !settings.stripeSecretKey || !user.stripeCustomerId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Portal indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--muted-foreground)]">
            O portal da Stripe ainda não está disponível para sua conta. Caso sua assinatura tenha sido feita por Pix, gere uma nova cobrança no pricing.
          </CardContent>
        </Card>
      </main>
    );
  }

  const stripe = new Stripe(settings.stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/perfil`
  });

  redirect(session.url);
}
