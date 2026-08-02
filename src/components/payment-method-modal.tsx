"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, CreditCard, Loader2, QrCode, ShieldCheck, Sparkles, Tag, X, Zap } from "lucide-react";
import { validateCouponAction } from "@/app/checkout/actions";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { UpgradePreview } from "@/components/pricing-cards";

type AppliedCoupon = { code: string; discountLabel: string; finalPriceLabel: string };

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
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  const label = !ctaText || ctaText.toLowerCase().includes("criar conta") ? "Assinar agora" : ctaText;
  const couponParam = coupon ? `&coupon=${encodeURIComponent(coupon.code)}` : "";
  const stripeHref = `/checkout/stripe?plan=${planSlug}${couponParam}`;
  const pixHref = `/checkout/mercado-pago?plan=${planSlug}${couponParam}`;
  const optionCount = (hasStripe ? 1 : 0) + (hasPix ? 1 : 0);

  function openModal() {
    setStep("preview");
    setCoupon(null);
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
          <DialogPanel className="overflow-hidden">
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
                <CheckoutHeader
                  title={`Upgrade para ${planName}`}
                  subtitle="Escolha como prefere pagar"
                  onClose={() => setOpen(false)}
                />
                <div className="space-y-3 p-5">
                  {hasStripe && (
                    <PaymentOption
                      href={stripeHref}
                      icon={<CreditCard className="h-5 w-5" />}
                      title="Cartão de crédito ou débito"
                      description="Upgrade na hora, com proração automática"
                      onClick={() => setOpen(false)}
                    />
                  )}
                  {hasPix && (
                    <PaymentOption
                      href={pixHref}
                      icon={<QrCode className="h-5 w-5" />}
                      title="Pix"
                      description="Paga só a diferença proporcional · Acesso imediato"
                      onClick={() => setOpen(false)}
                    />
                  )}
                </div>
                <TrustFooter />
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

  return (
    <>
      <Button variant={highlighted ? "default" : "outline"} className="w-full" onClick={openModal}>
        {highlighted && <Sparkles className="h-4 w-4" />}
        {label}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel className="overflow-hidden">
          <CheckoutHeader title={`Assinar ${planName}`} onClose={() => setOpen(false)} />

          {/* Resumo de valores no topo: o cliente vê o que vai pagar antes de escolher o meio,
              e o desconto aplicado aparece como linha própria (não só um preço trocado). */}
          <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4">
            {/* Detalhamento só existe quando há desconto — sem cupom, repetir o mesmo valor
                em duas linhas é ruído. */}
            {coupon && (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-[var(--muted-foreground)]">Plano {planName}</span>
                  <span className="text-[var(--muted-foreground)] line-through">{planPrice}</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--primary)]">
                    <BadgeCheck className="h-4 w-4" />
                    Cupom {coupon.code}
                  </span>
                  <span className="font-medium text-[var(--primary)]">− {coupon.discountLabel}</span>
                </div>
                <div className="mt-3 border-t border-[var(--border)]" />
              </>
            )}
            <div className={cn("flex items-baseline justify-between gap-3", coupon && "pt-3")}>
              <span className="text-sm font-semibold">Total por mês</span>
              <span className="text-2xl font-semibold tracking-tight">
                {coupon ? coupon.finalPriceLabel : planPrice}
              </span>
            </div>
          </div>

          {/* Cupom ANTES das formas de pagamento: clicar numa forma navega para fora, então um
              campo abaixo delas era ignorado — clientes com código estavam pagando cheio. */}
          <div className="border-b border-[var(--border)] px-5 py-4">
            <CouponBox planSlug={planSlug} applied={coupon} onApplied={setCoupon} />
          </div>

          <div className="p-5">
            <p className="mb-3 text-sm font-semibold">Como você prefere pagar?</p>
            <div className="space-y-3">
              {hasStripe && (
                <PaymentOption
                  href={stripeHref}
                  icon={<CreditCard className="h-5 w-5" />}
                  title="Cartão de crédito ou débito"
                  description="Renovação automática · Cancele quando quiser"
                  onClick={() => setOpen(false)}
                />
              )}
              {hasPix && (
                <PaymentOption
                  href={pixHref}
                  icon={<QrCode className="h-5 w-5" />}
                  title="Pix"
                  description="Aprovação na hora · Acesso liberado na sequência"
                  onClick={() => setOpen(false)}
                />
              )}
            </div>
          </div>

          <TrustFooter />
        </DialogPanel>
      </Dialog>
    </>
  );
}

/** Cabeçalho enxuto do checkout: título, subtítulo opcional e fechar. */
function CheckoutHeader({
  title,
  subtitle,
  onClose
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
      <div>
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Reforço de confiança no rodapé — padrão de checkout de grandes sites. */
function TrustFooter() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-3 text-xs text-[var(--muted-foreground)]">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Pagamento em ambiente seguro
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" />
        Acesso liberado após a confirmação
      </span>
    </div>
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
      <CheckoutHeader
        title={`Upgrade para ${planName}`}
        subtitle={preview ? `${preview.currentPlanName} → ${planName}` : `Trocar para ${planName}`}
        onClose={onClose}
      />
      <div className="space-y-4 p-5">
        {preview && (
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-sm">
            <PreviewRow label="Plano atual" value={`${formatMoney(preview.currentPriceCents)}/mês`} />
            <PreviewRow label="Novo plano" value={`${formatMoney(preview.newPriceCents)}/mês`} highlight />
            {preview.isRecurring ? (
              <PreviewRow label="Crédito / proração" value="Calculado automaticamente" subtle />
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
                    value={formatDateBR(preview.cycleEndDate)}
                    subtle
                  />
                )}
              </>
            )}
          </div>
        )}

        {preview?.isRecurring && (
          <p className="rounded-md bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            O crédito proporcional do período não utilizado é abatido automaticamente — você paga apenas a diferença.
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

/**
 * Opção de pagamento. Sem badge do gateway (Stripe/Mercado Pago) de propósito: o cliente
 * confundia com exigência de ter conta no provedor — "Mercado Pago" fazia parecer que só quem
 * tem conta lá consegue pagar via Pix.
 */
function PaymentOption({
  href,
  icon,
  title,
  description,
  onClick
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4",
        "transition-all hover:border-[var(--primary)] hover:bg-[var(--surface-subtle)] hover:shadow-[var(--shadow-sm)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
    </Link>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Campo de cupom. Fica SEMPRE visível (antes era um link "Tem um cupom?" que quase ninguém
 * abria) e acima das formas de pagamento, porque clicar numa forma navega para fora do modal.
 * O desconto mostrado aqui é só prévia: o valor real é recalculado no servidor ao criar a
 * cobrança, tanto no cartão quanto no Pix.
 */
function CouponBox({
  planSlug,
  applied,
  onApplied
}: {
  planSlug: string;
  applied: AppliedCoupon | null;
  onApplied: (value: AppliedCoupon | null) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // O resumo acima já mostra o cupom e o valor abatido, então aqui basta a confirmação
  // curta e a saída — repetir "Cupom X aplicado" em destaque duplicaria a mesma informação.
  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[var(--primary)]">
          <Check className="h-4 w-4 shrink-0" />
          Desconto aplicado
        </span>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-[var(--muted-foreground)] underline underline-offset-2 hover:text-[var(--foreground)]"
          onClick={() => {
            onApplied(null);
            setValue("");
            setError(null);
          }}
        >
          Remover cupom
        </button>
      </div>
    );
  }

  function apply() {
    const code = value.trim();
    if (!code) return;
    startTransition(async () => {
      const result = await validateCouponAction(planSlug, code);
      if (result.ok) {
        setError(null);
        onApplied(result);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label htmlFor="coupon-code" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <Tag className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        Cupom de desconto
        <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Digite seu código"
          maxLength={40}
          autoComplete="off"
          className={cn(
            "h-10 flex-1 rounded-md border bg-[var(--surface)] px-3 text-sm uppercase tracking-wide outline-none transition-colors",
            "placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--muted-foreground)]",
            error ? "border-[var(--destructive)]" : "border-[var(--border)] focus:border-[var(--primary)]"
          )}
        />
        <Button type="button" variant="outline" disabled={pending || !value.trim()} onClick={apply}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
