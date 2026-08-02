import type { Metadata } from "next";
import { auth } from "@/auth";
import { PricingCards } from "@/components/pricing-cards";
import { SaasableAssets } from "@/components/saasable/saasable-assets";
import { SaasableNavbar } from "@/components/saasable/saasable-navbar";
import { SaasableHero } from "@/components/saasable/saasable-hero";
import { SaasableFeatureGrid } from "@/components/saasable/saasable-feature-grid";
import { SaasableHowItWorks } from "@/components/saasable/saasable-how-it-works";
import { SaasableGuaranteeBadge } from "@/components/saasable/saasable-guarantee-badge";
import { SaasableFaq } from "@/components/saasable/saasable-faq";
import { SaasableTeamsCta } from "@/components/saasable/saasable-teams-cta";
import { SaasableFooter } from "@/components/saasable/saasable-footer";
import { getAppSettings } from "@/lib/app-settings";
import { findStripeSubscriptionId } from "@/lib/payments";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const appSettings = await getAppSettings();
  return {
    title: appSettings.appName,
    description: appSettings.institutionalText
  };
}

export default async function HomePage() {
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
    <>
      <SaasableAssets />

      <main className="dm-ready bg-theme-bg-default text-theme-text-primary" style={{ fontFamily: "var(--font-figtree), sans-serif" }}>
        <SaasableNavbar logoUrl={appSettings.logoUrl} appName={appSettings.appName} isLoggedIn={Boolean(session?.user)} />

        <SaasableHero />
        <SaasableFeatureGrid />
        <SaasableHowItWorks />

        <div className="px-4 md:px-6">
          <SaasableGuaranteeBadge />
        </div>

        <PricingCards
          plans={pricedPlans}
          compact
          headline={pricingContent.headline}
          subheadline={pricingContent.subheadline}
          hasStripe={hasStripe}
          hasPix={hasPix}
          currentPlan={currentPlan}
        />

        <SaasableFaq />
        <SaasableTeamsCta />
        <SaasableFooter logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
      </main>
    </>
  );
}
