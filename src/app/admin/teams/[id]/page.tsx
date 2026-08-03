import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, KeyRound, IdCard, Pause, Play, QrCode, XCircle } from "lucide-react";
import {
  addTeamCpfsAction,
  cancelTeamAction,
  generateTeamSeatsAction,
  issueTeamChargeAction,
  pauseTeamAction,
  renewTeamAction,
  resumeTeamAction,
  revokeTeamSeatAction,
  updateTeamAccountAction
} from "@/app/admin/teams/actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmActionButton } from "@/components/admin/confirm-action-button";
import { CopyButton } from "@/components/admin/copy-button";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appUrl } from "@/lib/payments";

import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { formatCpf } from "@/lib/validation/cpf";

const SEATS_PAGE_SIZE = 30;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date | null) {
  return formatDateTimeBR(date);
}

const TABS: AdminTabDef[] = [
  { value: "cobranca", label: "Cobrança" },
  { value: "pacote", label: "Pacote" },
  { value: "codigos", label: "Códigos & Allowlist" },
  { value: "vagas", label: "Vagas" }
];

export default async function TeamDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = sp.tab === "pacote" || sp.tab === "codigos" || sp.tab === "vagas" ? sp.tab : "cobranca";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const team = await prisma.teamAccount.findUnique({ where: { id }, include: { plan: true } });
  if (!team) notFound();

  const claimedCount = await prisma.teamSeat.count({ where: { teamAccountId: id, status: "CLAIMED" } });

  return (
    <div className="space-y-6">
      <Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para teams
      </Link>

      <AdminPageHeader
        title={team.name}
        description={`${team.plan.name} · ${claimedCount}/${team.seats} vagas usadas`}
        actions={<StatusBadge tone={statusTone(team.status)}>{team.status}</StatusBadge>}
      />

      <AdminTabs tabs={TABS} activeValue={activeTab} basePath={`/admin/teams/${id}`} />

      {activeTab === "cobranca" && <CobrancaTab team={team} />}
      {activeTab === "pacote" && <PacoteTab team={team} />}
      {activeTab === "codigos" && <CodigosTab teamId={id} />}
      {activeTab === "vagas" && <VagasTab teamId={id} page={page} />}
    </div>
  );
}

type TeamWithPlan = NonNullable<Awaited<ReturnType<typeof prisma.teamAccount.findUnique<{ where: { id: string }; include: { plan: true } }>>>>;

async function CobrancaTab({ team }: { team: TeamWithPlan }) {
  const charges = await prisma.teamCharge.findMany({ where: { teamAccountId: team.id }, orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobrança</CardTitle>
        <CardDescription>
          {formatMoney(team.priceCents)}/mês · vigência atual até <strong>{formatDate(team.currentPeriodEndsAt)}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Confirmação manual</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Recebeu o pagamento por fora? Estende a vigência em 30 dias e renova o acesso de todos os membros.
            </p>
            <form action={renewTeamAction}>
              <input type="hidden" name="teamAccountId" value={team.id} />
              <SubmitButton>Confirmar pagamento (+30 dias)</SubmitButton>
            </form>
          </div>

          <div className="space-y-2 rounded-md border border-[var(--border)] p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <QrCode className="h-4 w-4" />
              Emitir cobrança Pix (vence em 24h)
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Gera um link público com QR Code para a empresa pagar. Quando o Pix for aprovado, o pacote renova
              <strong> automaticamente</strong> (+30 dias para todos).
            </p>
            <form action={issueTeamChargeAction} className="flex items-end gap-2">
              <input type="hidden" name="teamAccountId" value={team.id} />
              <label className="block space-y-1 text-sm font-medium">
                Valor (R$)
                <Input name="amount" type="number" min={1} step="0.01" defaultValue={(team.priceCents / 100).toFixed(2)} className="w-32" />
              </label>
              <SubmitButton>Emitir Pix</SubmitButton>
            </form>
          </div>
        </div>

        {charges.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2">Valor</th>
                  <th>Status</th>
                  <th>Vence em</th>
                  <th>Criada em</th>
                  <th className="text-right">Link público</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => {
                  const link = `${appUrl()}/cobranca/${charge.id}`;
                  return (
                    <tr key={charge.id} className="border-t border-[var(--border)]">
                      <td className="py-3 font-semibold">{formatMoney(charge.amountCents)}</td>
                      <td>
                        <StatusBadge tone={statusTone(charge.status)}>{charge.status}</StatusBadge>
                      </td>
                      <td className="text-[var(--muted-foreground)]">{formatDate(charge.expiresAt)}</td>
                      <td className="text-[var(--muted-foreground)]">{formatDate(charge.createdAt)}</td>
                      <td className="text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <CopyButton value={link} label="Copiar link" />
                          <a
                            href={`/cobranca/${charge.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:bg-[var(--surface-subtle)]"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Abrir
                          </a>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PacoteTab({ team }: { team: TeamWithPlan }) {
  return (
    <div className="space-y-6">
      {team.status !== "CANCELED" && (
        <Card>
          <CardHeader>
            <CardTitle>Ações do pacote</CardTitle>
            <CardDescription>
              Pausar suspende o acesso de todos os membros imediatamente (reversível). Cancelar é definitivo: cancela as
              assinaturas cedidas e revoga todas as vagas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {team.status === "ACTIVE" ? (
              <ConfirmActionButton
                action={pauseTeamAction}
                fields={{ teamAccountId: team.id }}
                confirmMessage={`Pausar o pacote "${team.name}"? Todos os membros perdem o acesso imediatamente até você retomar.`}
              >
                <Pause className="h-4 w-4" />
                Pausar pacote
              </ConfirmActionButton>
            ) : (
              <ConfirmActionButton
                action={resumeTeamAction}
                fields={{ teamAccountId: team.id }}
                confirmMessage={`Retomar o pacote "${team.name}"? Os membros voltam a ter acesso até o fim da vigência.`}
                variant="default"
              >
                <Play className="h-4 w-4" />
                Retomar pacote
              </ConfirmActionButton>
            )}
            <ConfirmActionButton
              action={cancelTeamAction}
              fields={{ teamAccountId: team.id }}
              confirmMessage={`CANCELAR DEFINITIVAMENTE o pacote "${team.name}"? As assinaturas de todos os membros serão canceladas e todas as vagas revogadas. Esta ação não pode ser desfeita.`}
              variant="destructive"
            >
              <XCircle className="h-4 w-4" />
              Cancelar definitivamente
            </ConfirmActionButton>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dados do pacote</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={team.updatedAt.getTime()} action={updateTeamAccountAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={team.id} />
            <label className="block space-y-1 text-sm font-medium">
              Nome
              <Input name="name" defaultValue={team.name} required minLength={2} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Nº de vagas
              <Input name="seats" type="number" min={1} defaultValue={team.seats} required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Preço mensal (R$)
              <Input name="price" type="number" min={0} step="0.01" defaultValue={(team.priceCents / 100).toFixed(2)} required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (nome)
              <Input name="contactName" defaultValue={team.contactName ?? ""} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (e-mail)
              <Input name="contactEmail" type="email" defaultValue={team.contactEmail ?? ""} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contato (telefone)
              <Input name="contactPhone" defaultValue={team.contactPhone ?? ""} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              CPF/CNPJ
              <Input name="cpfCnpj" defaultValue={team.cpfCnpj ?? ""} />
            </label>
            <label className="block space-y-1 text-sm font-medium md:col-span-2">
              Observações
              <Textarea name="notes" rows={2} defaultValue={team.notes ?? ""} />
            </label>
            <div className="md:col-span-2">
              <SubmitButton>Salvar</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CodigosTab({ teamId }: { teamId: string }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Gerar códigos
          </CardTitle>
          <CardDescription>Cria vagas com código de convite para distribuir aos alunos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={generateTeamSeatsAction} className="flex items-end gap-2">
            <input type="hidden" name="teamAccountId" value={teamId} />
            <label className="block space-y-1 text-sm font-medium">
              Quantidade
              <Input name="quantity" type="number" min={1} max={500} defaultValue={10} className="w-28" />
            </label>
            <SubmitButton>Gerar</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="h-4 w-4" /> Allowlist de CPF
          </CardTitle>
          <CardDescription>Cole CPFs (um por linha ou separados por vírgula). Inválidos são ignorados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addTeamCpfsAction} className="space-y-2">
            <input type="hidden" name="teamAccountId" value={teamId} />
            <Textarea name="cpfs" rows={3} placeholder="123.456.789-09&#10;987.654.321-00" />
            <SubmitButton>Adicionar CPFs</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

async function VagasTab({ teamId, page }: { teamId: string; page: number }) {
  const [members, total] = await Promise.all([
    prisma.teamSeat.findMany({
      where: { teamAccountId: teamId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * SEATS_PAGE_SIZE,
      take: SEATS_PAGE_SIZE
    }),
    prisma.teamSeat.count({ where: { teamAccountId: teamId } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / SEATS_PAGE_SIZE));

  const userIds = members.map((m) => m.userId).filter((v): v is string => !!v);
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Vagas ({total})</CardTitle>
          <CardDescription>
            Códigos gerados, CPFs liberados e quem já reivindicou. Página {page} de {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Código</th>
                <th>CPF</th>
                <th>Status</th>
                <th>Membro</th>
                <th>Reivindicada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((seat) => {
                const u = seat.userId ? userMap.get(seat.userId) : null;
                return (
                  <tr key={seat.id} className="border-t border-[var(--border)]">
                    <td className="py-3 font-mono text-xs">{seat.inviteCode ?? "—"}</td>
                    <td>{seat.cpf ? formatCpf(seat.cpf) : "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(seat.status)}>{seat.status}</StatusBadge>
                    </td>
                    <td>{u ? <span title={u.email}>{u.email}</span> : "—"}</td>
                    <td className="text-[var(--muted-foreground)]">{formatDate(seat.claimedAt)}</td>
                    <td className="text-right">
                      {seat.status !== "REVOKED" && (
                        <form action={revokeTeamSeatAction}>
                          <input type="hidden" name="id" value={seat.id} />
                          <input type="hidden" name="teamAccountId" value={teamId} />
                          <SubmitButton variant="outline" size="sm">
                            Revogar
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-[var(--muted-foreground)]">
                    Nenhuma vaga criada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/teams/${teamId}?tab=vagas&page=${p}`} />
    </div>
  );
}
