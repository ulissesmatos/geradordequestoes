import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { createTeamAccountAction } from "@/app/admin/teams/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export default async function AdminTeamsPage() {
  const [teams, plans] = await Promise.all([
    prisma.teamAccount.findMany({
      include: {
        plan: { select: { name: true } },
        _count: { select: { members: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.subscriptionPlan.findMany({ orderBy: [{ displayOrder: "asc" }, { priceCents: "asc" }] })
  ]);

  // Conta vagas reivindicadas por pacote.
  const claimedCounts = await prisma.teamSeat.groupBy({
    by: ["teamAccountId"],
    where: { status: "CLAIMED" },
    _count: true
  });
  const claimedMap = new Map(claimedCounts.map((c) => [c.teamAccountId, c._count]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Teams / Empresas"
        description="Pacotes de assinatura em grupo com preço personalizado, ativados por código ou CPF."
      />

      {/* ── Lista ── */}
      <div className="space-y-3">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/admin/teams/${team.id}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-[var(--surface-subtle)]">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[var(--primary)]" />
                    <span className="truncate font-semibold">{team.name}</span>
                    <StatusBadge tone={statusTone(team.status)}>{team.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {team.plan.name} · {claimedMap.get(team.id) ?? 0}/{team.seats} vagas · {formatMoney(team.priceCents)}/mês ·
                    vence {formatDate(team.currentPeriodEndsAt)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              </CardContent>
            </Card>
          </Link>
        ))}
        {teams.length === 0 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum pacote criado ainda.
          </p>
        )}
      </div>

      {/* ── Criar pacote ── */}
      <Card>
        <CardHeader>
          <CardTitle>Novo pacote</CardTitle>
          <CardDescription>
            O plano define o tier de recursos/limites. Use um plano oculto (inativo) para não aparecer no /pricing público.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createTeamAccountAction} className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              Nome do pacote / empresa
              <Input name="name" required minLength={2} placeholder="Ex.: Cursinho Aprova" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Plano (tier)
              <Select name="planId" required>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isActive ? "" : " (oculto)"}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Nº de vagas
              <Input name="seats" type="number" min={1} defaultValue={10} required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Preço mensal (R$)
              <Input name="price" type="number" min={0} step="0.01" defaultValue={0} required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (nome)
              <Input name="contactName" placeholder="Responsável" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (e-mail)
              <Input name="contactEmail" type="email" placeholder="contato@empresa.com" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (telefone)
              <Input name="contactPhone" placeholder="(00) 00000-0000" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              CPF/CNPJ
              <Input name="cpfCnpj" placeholder="Documento da empresa" />
            </label>
            <label className="block space-y-1 text-sm font-medium md:col-span-2">
              Observações
              <Textarea name="notes" rows={2} placeholder="Anotações internas sobre o contrato..." />
            </label>
            <div className="md:col-span-2">
              <SubmitButton>Criar pacote</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
