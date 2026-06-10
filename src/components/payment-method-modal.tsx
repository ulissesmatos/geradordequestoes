"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, QrCode, Sparkles } from "lucide-react";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  planSlug: string;
  planName: string;
  planPrice: string;
  highlighted?: boolean;
  ctaText?: string;
  hasStripe?: boolean;
  hasPix?: boolean;
};

export function PaymentMethodModal({
  planSlug,
  planName,
  planPrice,
  highlighted = false,
  ctaText,
  hasStripe = true,
  hasPix = true
}: Props) {
  const [open, setOpen] = useState(false);

  const label =
    !ctaText || ctaText.toLowerCase().includes("criar conta")
      ? "Assinar agora"
      : ctaText;

  const stripeHref = `/checkout/stripe?plan=${planSlug}`;
  const pixHref = `/checkout/mercado-pago?plan=${planSlug}`;
  const optionCount = (hasStripe ? 1 : 0) + (hasPix ? 1 : 0);

  // Single option → go directly, no modal needed
  if (optionCount === 1) {
    const href = hasStripe ? stripeHref : pixHref;
    return (
      <Link href={href} className="block w-full">
        <Button variant={highlighted ? "default" : "outline"} className="w-full" asChild={false}>
          {highlighted && <Sparkles className="h-4 w-4" />}
          {label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  // No option configured
  if (optionCount === 0) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Pagamento não configurado
      </Button>
    );
  }

  // Multiple options → show modal
  return (
    <>
      <Button
        variant={highlighted ? "default" : "outline"}
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {highlighted && <Sparkles className="h-4 w-4" />}
        {label}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel>
          <DialogHeader
            title={`Assinar ${planName}`}
            description={`${planPrice} / mês · Escolha como prefere pagar`}
            onClose={() => setOpen(false)}
          />
          <div className="grid gap-3 p-5">
            {hasStripe && (
              <PaymentOption
                href={stripeHref}
                icon={<CreditCard className="h-6 w-6 text-[var(--primary)]" />}
                title="Cartão de crédito ou débito"
                description="Cobrança recorrente mensal · Cancele quando quiser"
                badge="Stripe"
                onClick={() => setOpen(false)}
              />
            )}
            {hasPix && (
              <PaymentOption
                href={pixHref}
                icon={<QrCode className="h-6 w-6 text-[var(--accent)]" />}
                title="Pix"
                description="Pagamento via QR Code · Acesso imediato"
                badge="Mercado Pago"
                onClick={() => setOpen(false)}
              />
            )}
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}

function PaymentOption({
  href,
  icon,
  title,
  description,
  badge,
  onClick
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4",
        "transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-sm)]"
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-subtle)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-snug">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--muted-foreground)]">
          {badge}
        </span>
        <ArrowRight className="h-4 w-4 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
