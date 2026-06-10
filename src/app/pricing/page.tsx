import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { PricingCards } from "@/components/pricing-cards";
import { Button } from "@/components/ui/button";
import { getAppSettings } from "@/lib/app-settings";
import { getPricingContent, planFeatures } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [plans, pricingContent, appSettings, paymentSettings] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }]
    }),
    getPricingContent(),
    getAppSettings(),
    prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } })
  ]);
  const pricedPlans = plans.map((plan) => ({ ...plan, features: planFeatures(plan) }));
  const hasStripe = !!paymentSettings?.stripeSecretKey;
  const hasPix = !!paymentSettings?.mercadoPagoAccessToken;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--background)]/88 backdrop-blur">
        <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src={appSettings.logoUrl} alt={appSettings.appName} width={744} height={179} className="h-11 w-auto max-w-[210px] object-contain md:h-14 md:max-w-[290px]" priority />
          </Link>
          <details className="group md:hidden">
            <summary className="flex h-10 w-10 list-none items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm marker:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menu</span>
            </summary>
            <nav className="absolute left-3 right-3 top-[calc(100%+8px)] z-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              <Link href="/login" className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Entrar</Link>
              <Link href="/register" className="mt-1 block rounded-md bg-[var(--primary)] px-3 py-3 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]">Criar conta</Link>
            </nav>
          </details>
          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <PricingCards plans={pricedPlans} headline={pricingContent.headline} subheadline={pricingContent.subheadline} hasStripe={hasStripe} hasPix={hasPix} />
      </div>
    </main>
  );
}
