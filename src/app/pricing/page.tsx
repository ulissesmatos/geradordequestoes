import Image from "next/image";
import Link from "next/link";
import { PricingCards } from "@/components/pricing-cards";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" }
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--background)]/88 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/brand/logo.png" alt="Gerador de Questões" width={220} height={94} className="h-8 w-auto max-w-[150px] object-contain md:h-10 md:max-w-none" priority />
          </Link>
          <nav className="flex items-center gap-2">
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
        <PricingCards plans={plans} />
      </div>
    </main>
  );
}
