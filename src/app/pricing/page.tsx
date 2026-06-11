import { auth } from "@/auth";
import { PricingCards } from "@/components/pricing-cards";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getAppSettings } from "@/lib/app-settings";
import { findStripeSubscriptionId } from "@/lib/payments";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [plans, pricingContent, appSettings, paymentSettings, session] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }]
    }),
    getPricingContent(),
    getAppSettings(),
    prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } }),
    auth()
  ]);
  const pricedPlans = plans.map((plan) => ({ ...plan, features: planFeatures(plan) }));
  const hasStripe = !!paymentSettings?.stripeSecretKey;
  const hasPix = !!paymentSettings?.mercadoPagoAccessToken;

  // Assinante logado: travamos nova assinatura e oferecemos apenas upgrade.
  const activeSubscription = session?.user?.id ? await getActiveSubscription(session.user.id) : null;
  let currentPlan = null;
  if (activeSubscription) {
    const stripeSubId = await findStripeSubscriptionId(activeSubscription.id);
    currentPlan = {
      id: activeSubscription.planId,
      name: activeSubscription.plan.name,
      priceCents: activeSubscription.plan.priceCents,
      endsAt: activeSubscription.endsAt?.toISOString() ?? null,
      isRecurring: !!stripeSubId
    };
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={appSettings.logoUrl} appName={appSettings.appName} showPlans={false} sticky={false} />
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <PricingCards plans={pricedPlans} headline={pricingContent.headline} subheadline={pricingContent.subheadline} hasStripe={hasStripe} hasPix={hasPix} currentPlan={currentPlan} />
      </div>
      <SiteFooter logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
    </main>
  );
}
