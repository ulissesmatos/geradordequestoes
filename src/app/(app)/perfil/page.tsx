import { cookies } from "next/headers";
import Link from "next/link";
import { SubscriptionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { ProfilePersonalForm } from "@/components/profile-personal-form";
import { Panel, PanelHeader } from "@/components/saasable/saasable-panel";
import { StudyPreferencesForm } from "@/components/study-preferences-form";
import { TeamCodeRedeem } from "@/components/team-code-redeem";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatDateBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/subscriptions";
import { deriveHeadlineUsage, getUsageSummary } from "@/lib/usage/ledger";
import { cn } from "@/lib/utils";

const statusMeta: Record<string, { label: string; className: string }> = {
  [SubscriptionStatus.ACTIVE]: { label: "Ativa", className: "bg-emerald-100 text-emerald-800" },
  [SubscriptionStatus.PAST_DUE]: { label: "Pagamento pendente", className: "bg-amber-100 text-amber-800" },
  [SubscriptionStatus.CANCELED]: { label: "Cancelada", className: "bg-rose-100 text-rose-800" }
};

export default async function ProfilePage({
  searchParams
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { upgrade } = await searchParams;
  const showUpgradeSuccess = upgrade === "success";
  const cookieStore = await cookies();
  const initialTheme = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);

  const [subscription, usageSummary, transactions, affiliateProfile] = await Promise.all([
    getActiveSubscription(user.id),
    getUsageSummary(user),
    prisma.paymentTransaction.findMany({
      where: { userId: user.id },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.affiliateProfile.findUnique({
      where: { userId: user.id },
      select: { isActive: true, commissionPercent: true }
    })
  ]);

  const usage = deriveHeadlineUsage(usageSummary);

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Completude do cadastro fiscal (CPF, telefone, nascimento).
  const fiscalFields = [user.cpf, user.phone, user.birthDate];
  const totalFields = fiscalFields.length;
  const filledCount = fiscalFields.filter(Boolean).length;
  const profileComplete = filledCount === totalFields;

  return (
    <div className="dm-ready mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="h1">Perfil</h1>
        <p className="body2 text-theme-text-secondary">Sua conta, assinatura e histórico de pagamentos.</p>
      </div>

      {showUpgradeSuccess && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <i className="ti ti-rosette-discount-check mt-0.5 text-xl leading-none shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Upgrade realizado com sucesso!</p>
            <p className="mt-0.5 text-sm text-emerald-700">
              Seu plano foi atualizado e o crédito proporcional do período anterior já foi abatido.
            </p>
          </div>
        </div>
      )}

      {/* ── Conta ── */}
      <Panel>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-500">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate subtitle1">{user.name ?? "Sem nome"}</p>
            <p className="truncate body2 text-theme-text-secondary">{user.email}</p>
          </div>
          {isAdmin && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 caption text-primary-800">
              <i className="ti ti-shield-check text-sm leading-none" />
              Administrador
            </span>
          )}
        </div>
      </Panel>

      {/* ── Aparência ── */}
      <Panel>
        <PanelHeader icon="ti-sun-moon" title="Aparência" description="Escolha entre acompanhar o sistema, ou fixar claro/escuro." />
        <ThemeToggle initialTheme={initialTheme} />
      </Panel>

      {/* ── Dados pessoais ── */}
      <Panel id="dados-pessoais">
        <PanelHeader
          icon="ti-id-badge-2"
          title="Dados pessoais"
          description={
            <>
              Usados para emissão de Pix e informações fiscais.{" "}
              <span className={cn("rounded-full px-2 py-0.5 caption", profileComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                Cadastro {filledCount}/{totalFields}
              </span>
            </>
          }
        />
        <ProfilePersonalForm
          name={user.name ?? ""}
          cpf={user.cpf}
          phone={user.phone}
          birthDate={user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null}
        />
      </Panel>

      {/* ── Preferências de estudo ── */}
      <Panel id="preferencias">
        <PanelHeader
          icon="ti-map-pin"
          title="Preferências de estudo"
          description="Escolha os estados onde pretende prestar concursos. A IA usa essa informação para alinhar exemplos, legislação estadual, órgãos e editais à sua região."
        />
        <div className="space-y-6">
          <StudyPreferencesForm selected={user.preferredStates} />
          <div className="border-t border-theme-divider pt-5">
            <NotificationPreferencesForm
              reviewReminderEnabled={!user.reviewReminderOptOut}
              weeklySummaryEnabled={!user.weeklySummaryOptOut}
              dailyQuestionGoal={user.dailyQuestionGoal}
            />
          </div>
        </div>
      </Panel>

      {/* ── Assinatura ── */}
      <Panel id="assinatura">
        <PanelHeader icon="ti-sparkles" title="Assinatura" />
        <div className="space-y-5">
          {isAdmin && !subscription ? (
            <div className="rounded-2xl border border-primary-500 bg-primary-50 p-4">
              <p className="font-semibold text-primary-800">Acesso de administrador</p>
              <p className="mt-1 text-sm text-primary-800/80">
                Sua conta tem acesso ilimitado a todos os recursos, sem necessidade de assinatura.
              </p>
            </div>
          ) : subscription ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="subtitle1">{subscription.plan.name}</p>
                  <p className="body2 text-theme-text-secondary">
                    {formatMoney(subscription.plan.priceCents)} / mês · desde {formatDate(subscription.startsAt)}
                  </p>
                </div>
                <span className={cn("rounded-full px-3 py-1 caption", statusMeta[subscription.status]?.className ?? "bg-neutral-200 text-neutral-800")}>
                  {statusMeta[subscription.status]?.label ?? subscription.status}
                </span>
              </div>

              {subscription.endsAt && (
                <p className="body2 text-theme-text-secondary">
                  Acesso válido até <strong>{formatDate(subscription.endsAt)}</strong>.
                </p>
              )}

              {usage.limit !== null && (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-theme-text-secondary">Uso de IA hoje</span>
                    <span className="font-semibold">{usage.used} de {usage.limit}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-theme-divider">
                    <div
                      className={cn("h-full rounded-full transition-all", usage.percent >= 90 ? "bg-amber-500" : "bg-primary-500")}
                      style={{ width: `${Math.min(100, usage.percent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 caption2 text-theme-text-secondary">
                    <span>O limite diário renova em cerca de <strong>{hoursUntilReset(usage.resetsAt)}h</strong>.</span>
                    {usage.percent >= 100 && (
                      <Link href="/pricing" className="font-semibold text-primary-500 hover:underline">
                        Fazer upgrade para gerar mais →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : usage.isTrial && usage.limit ? (
            <div className="rounded-2xl border border-theme-divider bg-theme-bg-default p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Mensagens/gerações grátis (mês)</span>
                <span className="font-semibold">{usage.used} de {usage.limit}</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-theme-divider">
                <div
                  className={cn("h-full rounded-full transition-all", usage.percent >= 90 ? "bg-amber-500" : "bg-primary-500")}
                  style={{ width: `${Math.min(100, usage.percent)}%` }}
                />
              </div>
              <p className="mt-2 caption2 text-theme-text-secondary">
                {usage.used >= usage.limit
                  ? "Você usou todas as suas mensagens/gerações grátis deste mês. Assine um plano para continuar usando a IA."
                  : `Você tem ${usage.limit - usage.used} ${usage.limit - usage.used === 1 ? "mensagem/geração grátis restante" : "mensagens/gerações grátis restantes"} este mês. Sem cartão.`}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-theme-divider p-4 text-center">
              <p className="body2 text-theme-text-secondary">Você não tem uma assinatura ativa.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant={subscription || isAdmin ? "outline" : "default"} size="sm">
              <Link href="/pricing">Ver planos</Link>
            </Button>
            {user.stripeCustomerId && (
              <Button asChild variant="outline" size="sm">
                <Link href="/checkout/stripe/portal">
                  <i className="ti ti-credit-card text-base leading-none" />
                  Gerenciar pagamento
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* ── Programa de afiliados (só para contas convidadas) ── */}
      {affiliateProfile?.isActive && (
        <Panel>
          <PanelHeader
            icon="ti-affiliate"
            title="Programa de afiliados"
            description={`Sua conta participa do programa: você ganha ${affiliateProfile.commissionPercent}% de cada pagamento dos alunos que indicar.`}
          />
          <Button asChild size="sm">
            <Link href="/afiliado">Abrir painel de afiliado →</Link>
          </Button>
        </Panel>
      )}

      {/* ── Código da empresa (plano teams) ── */}
      {!isAdmin && (
        <Panel>
          <PanelHeader icon="ti-building" title="Tem um código?" description="Recebeu um código? Aplique aqui para ativar seu acesso premium." />
          <TeamCodeRedeem />
        </Panel>
      )}

      {/* ── Histórico de pagamentos ── */}
      <Panel>
        <PanelHeader icon="ti-receipt" title="Histórico de pagamentos" description="Últimas transações da sua conta." />
        {transactions.length === 0 ? (
          <p className="body2 text-theme-text-secondary">Nenhum pagamento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left caption2 text-theme-text-secondary">
                <tr>
                  <th className="py-2">Plano</th>
                  <th>Forma</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-theme-divider">
                    <td className="py-3 font-medium">{tx.plan.name}</td>
                    <td>{tx.provider === "STRIPE" ? "Cartão" : "Pix"}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 caption",
                          tx.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : tx.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                        )}>
                          {tx.status === "APPROVED" ? "Pago" : tx.status === "PENDING" ? "Pendente" : tx.status}
                        </span>
                        {tx.status === "PENDING" && tx.provider === "MERCADO_PAGO" && tx.checkoutSessionId && (
                          <Link
                            href={`/checkout/pix/${tx.checkoutSessionId}`}
                            className="text-xs font-semibold text-primary-500 hover:underline"
                          >
                            Ver QR Code →
                          </Link>
                        )}
                      </div>
                    </td>
                    <td>{formatMoney(tx.amountCents)}</td>
                    <td className="text-theme-text-secondary">{tx.paidAt ? formatDate(tx.paidAt) : formatDate(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return formatDateBR(date, "medium");
}

function hoursUntilReset(resetsAt: string | null | undefined) {
  if (!resetsAt) return 24;
  const ms = new Date(resetsAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 3_600_000));
}
