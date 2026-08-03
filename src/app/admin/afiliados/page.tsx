import { AffiliateWithdrawalStatus } from "@prisma/client";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AffiliateCreateForm } from "@/components/admin/affiliate-create-form";
import { AffiliateReferralsButton } from "@/components/admin/affiliate-referrals-modal";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { affiliateLinkUrl, getAffiliateBalance, getAffiliateReferralDetails } from "@/lib/affiliates";
import { formatDateBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { processWithdrawalAction, updateAffiliateAction } from "@/app/admin/afiliados/actions";

const PROCESSED_PAGE_SIZE = 20;

const TABS: AdminTabDef[] = [
  { value: "afiliados", label: "Afiliados" },
  { value: "saques", label: "Saques" }
];

export default async function AdminAffiliatesPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab === "saques" ? "saques" : "afiliados";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Afiliados"
        description="Contas convidadas divulgam um link e ganham comissão por pagamento dos indicados. Saques processados manualmente via Pix."
      />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/afiliados" />

      {activeTab === "afiliados" && <AfiliadosTab />}
      {activeTab === "saques" && <SaquesTab page={page} />}
    </div>
  );
}

async function AfiliadosTab() {
  const profiles = await prisma.affiliateProfile.findMany({
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { referrals: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  const balances = new Map(await Promise.all(profiles.map(async (profile) => [profile.id, await getAffiliateBalance(profile.id)] as const)));
  const referralDetails = new Map(
    await Promise.all(profiles.map(async (profile) => [profile.id, await getAffiliateReferralDetails(profile.id)] as const))
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo afiliado</CardTitle>
          <CardDescription>Escolha a conta pelo e-mail e defina o percentual de comissão.</CardDescription>
        </CardHeader>
        <CardContent>
          <AffiliateCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Afiliados ({profiles.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profiles.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum afiliado criado ainda.</p>}
          {profiles.map((profile) => {
            const balance = balances.get(profile.id);
            const referrals = referralDetails.get(profile.id) ?? [];
            return (
              <div key={profile.id} className="rounded-md border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {profile.user.name}{" "}
                      {!profile.isActive && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">inativo</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">{profile.user.email}</p>
                    <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{affiliateLinkUrl(profile.code)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {profile._count.referrals} indicados · ganho total {formatMoney(balance?.totalEarnedCents ?? 0)} ·
                        saldo {formatMoney(balance?.availableCents ?? 0)}
                      </p>
                      <AffiliateReferralsButton
                        affiliateName={profile.user.name}
                        referrals={referrals.map((referral) => ({
                          ...referral,
                          joinedAt: referral.joinedAt.toISOString()
                        }))}
                      />
                    </div>
                  </div>
                  <form action={updateAffiliateAction} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="profileId" value={profile.id} />
                    <label className="flex items-center gap-1 text-xs font-medium">
                      %
                      <Input
                        name="commissionPercent"
                        type="number"
                        min={1}
                        max={90}
                        defaultValue={profile.commissionPercent}
                        className="h-8 w-20 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-medium">
                      <input type="checkbox" name="isActive" defaultChecked={profile.isActive} className="h-4 w-4" />
                      Ativo
                    </label>
                    <SubmitButton className="h-8 px-3 text-xs">Salvar</SubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

async function SaquesTab({ page }: { page: number }) {
  const [pendingWithdrawals, processedWithdrawals, processedTotal] = await Promise.all([
    prisma.affiliateWithdrawal.findMany({
      where: { status: AffiliateWithdrawalStatus.REQUESTED },
      include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.affiliateWithdrawal.findMany({
      where: { status: { not: AffiliateWithdrawalStatus.REQUESTED } },
      include: { affiliate: { include: { user: { select: { name: true } } } } },
      orderBy: { processedAt: "desc" },
      skip: (page - 1) * PROCESSED_PAGE_SIZE,
      take: PROCESSED_PAGE_SIZE
    }),
    prisma.affiliateWithdrawal.count({ where: { status: { not: AffiliateWithdrawalStatus.REQUESTED } } })
  ]);
  const totalPages = Math.max(1, Math.ceil(processedTotal / PROCESSED_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Saques aguardando pagamento {pendingWithdrawals.length > 0 && `(${pendingWithdrawals.length})`}</CardTitle>
          <CardDescription>Pague via Pix na chave informada e marque como pago. Recusar devolve o valor ao saldo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingWithdrawals.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum saque pendente.</p>}
          {pendingWithdrawals.map((withdrawal) => (
            <div key={withdrawal.id} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold">
                    {formatMoney(withdrawal.amountCents)} — {withdrawal.affiliate.user.name}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {withdrawal.affiliate.user.email} · pedido em {formatDate(withdrawal.createdAt)}
                  </p>
                  <p className="mt-1 font-mono text-xs">Chave Pix: {withdrawal.pixKey}</p>
                </div>
                <form action={processWithdrawalAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                  <Input name="note" placeholder="Observação (opcional)" className="h-8 w-44 text-xs" />
                  <SubmitButton name="decision" value="PAID" className="h-8 px-3 text-xs">
                    Marcar pago
                  </SubmitButton>
                  <SubmitButton name="decision" value="REJECTED" variant="destructive" className="h-8 px-3 text-xs">
                    Recusar
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saques processados</CardTitle>
          <CardDescription>
            {processedTotal} registros · página {page} de {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {processedWithdrawals.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum saque processado ainda.</p>}
          {processedWithdrawals.map((withdrawal) => (
            <div
              key={withdrawal.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3 text-sm"
            >
              <span>
                <strong>{formatMoney(withdrawal.amountCents)}</strong> — {withdrawal.affiliate.user.name}
                {withdrawal.note ? ` · ${withdrawal.note}` : ""}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  withdrawal.status === AffiliateWithdrawalStatus.PAID ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                {withdrawal.status === AffiliateWithdrawalStatus.PAID ? "Pago" : "Recusado"}
                {withdrawal.processedAt ? ` · ${formatDate(withdrawal.processedAt)}` : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/afiliados?tab=saques&page=${p}`} />
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return formatDateBR(date, "medium");
}
