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
import { StructuredData } from "@/components/structured-data";
import { getAppSettings } from "@/lib/app-settings";
import { FAQ_ITEMS } from "@/lib/faq-content";
import { findStripeSubscriptionId } from "@/lib/payments";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/seo";
import { getActiveSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const appSettings = await getAppSettings();
  return {
    // "absolute" pula o title.template do layout raiz (senão duplicaria o nome do app).
    title: { absolute: `${appSettings.appName} — Questões de concurso geradas por IA` },
    description: appSettings.institutionalText,
    alternates: { canonical: "/" }
  };
}

export default async function HomePage() {
  const [plans, pricingContent, appSettings, paymentSettings, session, siteUrl] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }]
    }),
    getPricingContent(),
    getAppSettings(),
    prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } }),
    auth(),
    getSiteUrl()
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

  const logoUrl = appSettings.logoUrl.startsWith("http") ? appSettings.logoUrl : `${siteUrl}${appSettings.logoUrl}`;
  // Grafo consumido por rich results do Google e por IAs (GEO) tentando entender/citar a
  // página. FAQPage reaproveita FAQ_ITEMS — não pode divergir do que é renderizado abaixo.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        name: appSettings.appName,
        url: siteUrl,
        logo: logoUrl,
        description: appSettings.institutionalText
      },
      {
        "@type": "SoftwareApplication",
        name: appSettings.appName,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: appSettings.institutionalText,
        offers: pricedPlans.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: (plan.priceCents / 100).toFixed(2),
          priceCurrency: "BRL",
          url: `${siteUrl}/pricing`
        }))
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  };

  return (
    <>
      <StructuredData data={structuredData} />
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
