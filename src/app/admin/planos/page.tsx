import { createCouponAction, createPlanAction, deleteCouponAction, updatePlanAction, updatePricingContentAction } from "@/app/admin/admin-actions";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defaultPlanFeatures, getPricingContent } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export default async function AdminPlansPage() {
  const [plans, coupons, pricingContent] = await Promise.all([
    prisma.subscriptionPlan.findMany({ orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }] }),
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
    getPricingContent()
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Planos & Pricing</h1>
        <p className="text-[var(--muted-foreground)]">Controle planos, features, textos públicos, cupons e IDs dos gateways.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Textos públicos do pricing</CardTitle>
          <CardDescription>Esses textos aparecem na landing, /pricing e paywall.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePricingContentAction} className="grid gap-3">
            <Input name="headline" defaultValue={pricingContent.headline} placeholder="Headline dos planos" required />
            <Textarea name="subheadline" defaultValue={pricingContent.subheadline} placeholder="Subheadline dos planos" required />
            <Input name="paywallTitle" defaultValue={pricingContent.paywallTitle} placeholder="Título do paywall" required />
            <Textarea name="paywallDescription" defaultValue={pricingContent.paywallDescription} placeholder="Descrição do paywall" required />
            <SubmitButton>Salvar textos</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo plano</CardTitle>
          <CardDescription>Use {"{limit}"} nas features para inserir automaticamente o limite diário.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPlanAction} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Input name="name" placeholder="Nome" required />
              <Input name="price" type="number" step="0.01" min="0" placeholder="Preço mensal" required />
              <Input name="aiGenerationsPerDay" type="number" min="1" placeholder="Gerações/dia" required />
              <Input name="displayOrder" type="number" defaultValue={plans.length + 1} placeholder="Ordem" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="marketingSubtitle" placeholder="Subtítulo comercial" />
              <Input name="ctaText" defaultValue="Assinar com cartão" placeholder="Texto do botão principal" />
            </div>
            <Textarea name="description" placeholder="Descrição interna/geral" />
            <Textarea name="features" defaultValue={defaultPlanFeatures.join("\n")} placeholder="Uma feature por linha" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Input name="stripePriceId" placeholder="price_xxx (não prod_xxx)" />
                <p className="text-xs text-[var(--muted-foreground)]">Stripe Dashboard → Products → seu produto → Pricing → copie o ID que começa com <code>price_</code></p>
              </div>
              <Input name="mercadoPagoReference" placeholder="Referência Mercado Pago" />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input name="isActive" type="checkbox" defaultChecked /> Ativo</label>
              <label className="flex items-center gap-2"><input name="isHighlighted" type="checkbox" /> Destacar como popular</label>
            </div>
            <SubmitButton>Criar plano</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.isActive ? "Ativo publicamente" : "Oculto publicamente"} {plan.isHighlighted ? "/ destacado" : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updatePlanAction} className="space-y-3">
                <input type="hidden" name="planId" value={plan.id} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input name="name" defaultValue={plan.name} required />
                  <Input name="displayOrder" type="number" defaultValue={plan.displayOrder} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input name="price" type="number" step="0.01" min="0" defaultValue={(plan.priceCents / 100).toFixed(2)} required />
                  <Input name="aiGenerationsPerDay" type="number" min="1" defaultValue={plan.aiGenerationsPerDay} required />
                </div>
                <Input name="marketingSubtitle" defaultValue={plan.marketingSubtitle ?? ""} placeholder="Subtítulo comercial" />
                <Input name="ctaText" defaultValue={plan.ctaText} placeholder="Texto do botão principal" />
                <Textarea name="description" defaultValue={plan.description ?? ""} placeholder="Descrição" />
                <Textarea name="features" defaultValue={(plan.features.length ? plan.features : defaultPlanFeatures).join("\n")} placeholder="Uma feature por linha" />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Input
                      name="stripePriceId"
                      defaultValue={plan.stripePriceId ?? ""}
                      placeholder="price_xxx (não prod_xxx)"
                      className={plan.stripePriceId && !plan.stripePriceId.startsWith("price_") ? "border-amber-400 focus:ring-amber-400" : ""}
                    />
                    {plan.stripePriceId && !plan.stripePriceId.startsWith("price_") && (
                      <p className="text-xs font-semibold text-amber-600">⚠ Parece ser um Product ID (prod_). Use o Price ID (price_) em vez disso.</p>
                    )}
                    {!plan.stripePriceId && (
                      <p className="text-xs text-[var(--muted-foreground)]">Stripe Dashboard → Products → seu produto → Pricing → ID que começa com <code>price_</code></p>
                    )}
                  </div>
                  <Input name="mercadoPagoReference" defaultValue={plan.mercadoPagoReference ?? ""} placeholder="Referência Mercado Pago" />
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input name="isActive" type="checkbox" defaultChecked={plan.isActive} /> Ativo</label>
                  <label className="flex items-center gap-2"><input name="isHighlighted" type="checkbox" defaultChecked={plan.isHighlighted} /> Destacado</label>
                </div>
                <SubmitButton className="w-full">Salvar plano</SubmitButton>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Novo cupom</CardTitle></CardHeader>
        <CardContent>
          <form action={createCouponAction} className="grid gap-3 md:grid-cols-5">
            <Input name="code" placeholder="CODIGO" required />
            <Select name="type" defaultValue="PERCENT">
              <option value="PERCENT">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </Select>
            <Input name="value" type="number" min="0" placeholder="Valor" required />
            <Input name="maxUses" type="number" min="1" placeholder="Uso máximo" />
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked /> Ativo
            </label>
            <SubmitButton>Criar cupom</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cupons</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {coupons.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum cupom criado.</p>}
          {coupons.map((coupon) => (
            <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3 text-sm">
              <span>
                <strong>{coupon.code}</strong> / {coupon.type} / {coupon.value} / {coupon.usedCount}
                {coupon.maxUses ? ` de ${coupon.maxUses} usos` : " usos ilimitados"} / {coupon.isActive ? "ativo" : "inativo"}
              </span>
              <ConfirmDeleteButton action={deleteCouponAction} id={coupon.id} confirmMessage={`Excluir o cupom "${coupon.code}"?`} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
