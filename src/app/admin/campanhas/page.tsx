import Link from "next/link";
import { createCampaignAction, deleteCampaignAction, updateCampaignAction } from "@/app/admin/admin-actions";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCampaignSpendSummary } from "@/lib/analytics/campaigns";
import { formatDateBR } from "@/lib/dates";
import { MARKETING_CHANNEL_LABELS, marketingChannelLabel } from "@/lib/labels";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function AdminCampaignsPage() {
  const campaigns = await getCampaignSpendSummary();
  const totalSpentCents = campaigns.reduce((sum, c) => sum + c.spentCents, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Campanhas de marketing"
        description="Canal, período e orçamento de cada campanha. O gasto real é a soma das despesas (categoria Marketing) lançadas em Despesas e vinculadas a ela — não um valor digitado à parte."
      />

      <Card>
        <CardHeader>
          <CardTitle>{formatMoney(totalSpentCents)}</CardTitle>
          <CardDescription>Gasto total em campanhas (soma das despesas vinculadas, todo o período)</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova campanha</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCampaignAction} className="grid gap-3 md:grid-cols-3">
            <Input name="name" placeholder="Nome (ex.: Google Ads — vestibular 2026)" required className="md:col-span-2" />
            <Select name="channel" required defaultValue="">
              <option value="" disabled>
                Canal
              </option>
              {Object.entries(MARKETING_CHANNEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Início</span>
              <Input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Fim (opcional — em andamento)</span>
              <Input name="endDate" type="date" />
            </label>
            <Input name="budget" type="number" step="0.01" min="0" placeholder="Orçamento planejado (R$, opcional)" />
            <Textarea name="notes" placeholder="Notas (opcional)" className="md:col-span-3" />
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked /> Ativa
            </label>
            <div className="md:col-span-3">
              <SubmitButton>Criar campanha</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((campaign) => {
          const budgetUsedPercent = campaign.budgetCents ? Math.round((campaign.spentCents / campaign.budgetCents) * 100) : null;
          return (
            <Card key={campaign.id}>
              <CardHeader>
                <CardTitle>{campaign.name}</CardTitle>
                <CardDescription>
                  {marketingChannelLabel(campaign.channel)} · {formatDateBR(campaign.startDate)} –{" "}
                  {campaign.endDate ? formatDateBR(campaign.endDate) : "em andamento"} · {campaign.isActive ? "Ativa" : "Inativa"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3 text-sm">
                  <span>
                    Gasto real: <strong>{formatMoney(campaign.spentCents)}</strong>
                    {campaign.budgetCents !== null && (
                      <>
                        {" "}
                        de {formatMoney(campaign.budgetCents)} orçados ({budgetUsedPercent}%)
                      </>
                    )}
                  </span>
                  <Link href={`/admin/despesas?campaignId=${campaign.id}`} className="text-xs font-semibold underline">
                    Ver/lançar despesas desta campanha →
                  </Link>
                </div>

                <form key={`${campaign.id}`} action={updateCampaignAction} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Input name="name" defaultValue={campaign.name} required className="md:col-span-2" />
                  <Select name="channel" defaultValue={campaign.channel} required>
                    {Object.entries(MARKETING_CHANNEL_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input name="budget" type="number" step="0.01" min="0" defaultValue={campaign.budgetCents !== null ? (campaign.budgetCents / 100).toFixed(2) : ""} placeholder="Orçamento (R$)" />
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Início</span>
                    <Input name="startDate" type="date" required defaultValue={toDateInputValue(campaign.startDate)} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Fim</span>
                    <Input name="endDate" type="date" defaultValue={toDateInputValue(campaign.endDate)} />
                  </label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input name="isActive" type="checkbox" defaultChecked={campaign.isActive} /> Ativa
                  </label>
                  <div className="flex items-center gap-3 md:col-span-2">
                    <SubmitButton variant="outline">Salvar</SubmitButton>
                    <ConfirmDeleteButton
                      action={deleteCampaignAction}
                      id={campaign.id}
                      label="Excluir campanha"
                      confirmMessage={`Excluir a campanha "${campaign.name}"? As despesas já lançadas continuam existindo, só ficam sem campanha vinculada.`}
                    />
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
        {campaigns.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhuma campanha cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
