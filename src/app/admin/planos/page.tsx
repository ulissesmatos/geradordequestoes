import { createCouponAction, createPlanAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

export default async function AdminPlansPage() {
  const [plans, coupons] = await Promise.all([
    prisma.subscriptionPlan.findMany({ orderBy: { priceCents: "asc" } }),
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } })
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Planos e cupons</h1>

      <Card>
        <CardHeader>
          <CardTitle>Novo plano</CardTitle>
          <CardDescription>Planos são ativados manualmente em Usuários nesta etapa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPlanAction} className="grid gap-3 md:grid-cols-5">
            <Input name="name" placeholder="Nome" required />
            <Input name="price" type="number" step="0.01" min="0" placeholder="Preço mensal" required />
            <Input name="aiGenerationsPerDay" type="number" min="1" placeholder="Gerações/dia" required />
            <Textarea name="description" placeholder="Descrição" />
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked /> Ativo
            </label>
            <SubmitButton>Criar plano</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(plan.priceCents)}</p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{plan.aiGenerationsPerDay} gerações por dia</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{plan.isActive ? "Ativo" : "Inativo"}</p>
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
            <div key={coupon.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
              <strong>{coupon.code}</strong> / {coupon.type} / {coupon.value} / {coupon.usedCount}
              {coupon.maxUses ? ` de ${coupon.maxUses} usos` : " usos ilimitados"} / {coupon.isActive ? "ativo" : "inativo"}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100);
}
