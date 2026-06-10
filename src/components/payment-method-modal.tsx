"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, QrCode, Sparkles } from "lucide-react";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UpgradePreview } from "@/components/pricing-cards";

type Props = {
  planSlug: string;
  planName: string;
  planPrice: string;
  highlighted?: boolean;
  ctaText?: string;
  hasStripe?: boolean;
  hasPix?: boolean;
  isUpgrade?: boolean;
  upgradePreview?: UpgradePreview | null;
};

export function PaymentMethodModal({
  planSlug,
  planName,
  planPrice,
  highlighted = false,
  ctaText,
  hasStripe = true,
  hasPix = true,
  isUpgrade = false,
  upgradePreview = null
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"preview" | "choose">("preview");

  const label = !ctaText || ctaText.toLowerCase().includes("criar conta") ? "Assinar agora" : ctaText;
  const stripeHref = `/checkout/stripe?plan=${planSlug}`;
  const pixHref = `/checkout/mercado-pago?plan=${planSlug}`;
  const optionCount = (hasStripe ? 1 : 0) + (hasPix ? 1 : 0);

  function openModal() {
    setStep("preview");
    setOpen(true);
  }

  // Upgrade: sempre abre modal (mesmo com opção única) para mostrar a prévia
  if (isUpgrade) {
    return (
      <>
        <Button variant={highlighted ? "default" : "outline"} className="w-full" onClick={openModal}>
          {highlighted && <Sparkles className="h-4 w-4" />}
          {label}
          <ArrowRight className="h-4 w-4" />
        </Button>

        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogPanel>
            {step === "preview" ? (
              <UpgradePreviewPane
                planName={planName}
                preview={upgradePreview}
                singleHref={optionCount === 1 ? (hasStripe ? stripeHref : pixHref) : null}
                onClose={() => setOpen(false)}
                onConfirm={() => {
                  if (optionCount === 1) {
                    window.location.href = hasStripe ? stripeHref : pixHref;
                  } else {
                    setStep("choose");
                  }
                }}
              />
            ) : (
              <>
                <DialogHeader
                  title={`Upgrade para ${planName}`}
                  description="Escolha como prefere pagar"
                  onClose={() => setOpen(false)}
                />
                <div className="grid gap-3 p-5">
                  {hasStripe && (
                    <PaymentOption
                      href={stripeHref}
                      icon={<CreditCard className="h-6 w-6 text-[var(--primary)]" />}
                      title="Cartão de crédito ou débito"
                      description="Upgrade imediato com proração automática"
                      badge="Stripe"
                      onClick={() => setOpen(false)}
                    />
                  )}
                  {hasPix && (
                    <PaymentOption
                      href={pixHref}
                      icon={<QrCode className="h-6 w-6 text-[var(--accent)]" />}
                      title="Pix"
                      description="Paga só a diferença proporcional · Acesso imediato"
                      badge="Mercado Pago"
                      onClick={() => setOpen(false)}
                    />
                  )}
                </div>
              </>
            )}
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  // Sem opção configurada
  if (optionCount === 0) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Pagamento não configurado
      </Button>
    );
  }

  // Opção única: link direto sem modal
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

  // Múltiplas opções: abre modal de escolha
  return (
    <>
      <Button variant={highlighted ? "default" : "outline"} className="w-full" onClick={() => setOpen(true)}>
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

function UpgradePreviewPane({
  planName,
  preview,
  singleHref,
  onClose,
  onConfirm
}: {
  planName: string;
  preview: UpgradePreview | null;
  singleHref: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader
        title={`Upgrade para ${planName}`}
        description={preview ? `${preview.currentPlanName} → ${planName}` : `Trocar para ${planName}`}
        onClose={onClose}
      />
      <div className="space-y-4 p-5">
        {preview && (
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-sm">
            <PreviewRow label="Plano atual" value={`${formatMoney(preview.currentPriceCents)}/mês`} />
            <PreviewRow label="Novo plano" value={`${formatMoney(preview.newPriceCents)}/mês`} highlight />
            {preview.isRecurring ? (
              <PreviewRow label="Crédito / proração" value="Calculado pelo Stripe" subtle />
            ) : (
              <>
                {preview.creditCents !== null && preview.creditCents > 0 && (
                  <PreviewRow label="Crédito proporcional" value={`− ${formatMoney(preview.creditCents)}`} />
                )}
                <PreviewRow
                  label="A pagar agora"
                  value={preview.dueCents !== null ? formatMoney(preview.dueCents) : "—"}
                  highlight
                />
                {preview.cycleEndDate && (
                  <PreviewRow
                    label="Acesso válido até"
                    value={new Date(preview.cycleEndDate).toLocaleDateString("pt-BR")}
                    subtle
                  />
                )}
              </>
            )}
          </div>
        )}

        {preview?.isRecurring && (
          <p className="rounded-md bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            O Stripe abaterá automaticamente o crédito proporcional do período não utilizado e cobrará apenas a diferença.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            {singleHref ? "Confirmar upgrade" : "Escolher forma de pagamento"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function PreviewRow({
  label,
  value,
  highlight,
  subtle
}: {
  label: string;
  value: string;
  highlight?: boolean;
  subtle?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className={cn("text-[var(--muted-foreground)]", subtle && "text-xs")}>{label}</span>
      <span
        className={cn(
          "font-medium",
          highlight && "font-semibold text-[var(--primary)]",
          subtle && "text-xs text-[var(--muted-foreground)]"
        )}
      >
        {value}
      </span>
    </div>
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
      <div className="min-w-0 flex-1">
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

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
