import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import {
  activateUserSubscriptionAction,
  cancelUserSubscriptionAction,
  issueUserPixChargeAction,
  updateUserAction
} from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPasswordTools } from "@/components/admin/admin-password-tools";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { CheckoutRow } from "@/components/admin/checkout-row";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge, statusTone } from "@/components/admin/status-badge";
import {
  UserChatMessages,
  UserChatOverviewCards,
  type AdminChatMessageRow
} from "@/components/admin/user-chat-history";
import { UserUsagePanel } from "@/components/admin/user-usage-panel";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { deriveHeadlineUsage, getUsageSummary } from "@/lib/usage/ledger";
import { getUserChatOverview, getUserUsageReport } from "@/lib/usage/report";
import { formatCpf, formatPhone } from "@/lib/validation/cpf";

const SUBS_PAGE_SIZE = 15;
const TRANSACTIONS_PAGE_SIZE = 15;
const CHAT_PAGE_SIZE = 25;

type UserSummary = {
  id: string;
  name: string;
  email: string;
  isBlocked: boolean;
  role: Role;
  emailVerified: Date | null;
  cpf: string | null;
  phone: string | null;
  birthDate: Date | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash: string | null;
};

function formatDate(date: Date | null | undefined) {
  return formatDateTimeBR(date);
}

function formatDay(date: Date | null | undefined) {
  return formatDateBR(date);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const TABS: AdminTabDef[] = [
  { value: "perfil", label: "Perfil" },
  { value: "consumo", label: "Consumo" },
  { value: "chat", label: "Chat" },
  { value: "assinatura", label: "Assinatura" },
  { value: "senha", label: "Senha" },
  { value: "transacoes", label: "Transações" },
  { value: "perigo", label: "Zona de perigo" }
];

const TAB_VALUES = new Set(TABS.map((tab) => tab.value));

export default async function UserDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = sp.tab && TAB_VALUES.has(sp.tab) ? sp.tab : "perfil";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const user: UserSummary | null = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isBlocked: true,
      role: true,
      emailVerified: true,
      cpf: true,
      phone: true,
      birthDate: true,
      stripeCustomerId: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: true
    }
  });
  if (!user) notFound();

  const activeSub = await prisma.userSubscription.findFirst({
    where: { userId: id, status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-6">
      <Link href="/admin/usuarios" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para usuários
      </Link>

      <AdminPageHeader
        title={user.name}
        description={user.email}
        actions={
          <div className="flex gap-2">
            {user.isBlocked && <StatusBadge tone="danger">Bloqueado</StatusBadge>}
            {user.role === "ADMIN" && <StatusBadge tone="info">Admin</StatusBadge>}
            {activeSub ? (
              <StatusBadge tone="success">{activeSub.plan.name}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Sem plano</StatusBadge>
            )}
          </div>
        }
      />

      <AdminTabs tabs={TABS} activeValue={activeTab} basePath={`/admin/usuarios/${id}`} />

      {activeTab === "perfil" && <PerfilTab user={user} />}
      {activeTab === "consumo" && <ConsumoTab user={user} />}
      {activeTab === "chat" && <ChatTab userId={id} page={page} />}
      {activeTab === "assinatura" && <AssinaturaTab userId={id} page={page} />}
      {activeTab === "senha" && <SenhaTab userId={id} hasPassword={Boolean(user.passwordHash)} />}
      {activeTab === "transacoes" && <TransacoesTab userId={id} page={page} hasCpf={Boolean(user.cpf)} />}
      {activeTab === "perigo" && <PerigoTab userId={id} userName={user.name} />}
    </div>
  );
}

async function PerfilTab({ user }: { user: UserSummary }) {
  const teamSeat = await prisma.teamSeat.findFirst({
    where: { userId: user.id, status: "CLAIMED" },
    include: { teamAccount: { select: { id: true, name: true } } }
  });
  const usage = deriveHeadlineUsage(await getUsageSummary({ id: user.id, role: user.role }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="E-mail" value={user.email} />
            <Field label="E-mail verificado" value={user.emailVerified ? formatDate(user.emailVerified) : "Não"} />
            <Field label="CPF" value={user.cpf ? formatCpf(user.cpf) : "—"} />
            <Field label="Telefone" value={user.phone ? formatPhone(user.phone) : "—"} />
            <Field label="Nascimento" value={formatDay(user.birthDate)} />
            <Field label="Stripe Customer" value={user.stripeCustomerId ?? "—"} />
            <Field label="Criado em" value={formatDate(user.createdAt)} />
            <Field
              label="Pacote teams"
              value={
                teamSeat ? (
                  <Link href={`/admin/teams/${teamSeat.teamAccount.id}`} className="text-[var(--primary)] hover:underline">
                    {teamSeat.teamAccount.name}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Field label="ID" value={<code className="text-xs">{user.id}</code>} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conta & uso</CardTitle>
          <CardDescription>
            {/* Janela diferente por tipo de conta: assinante tem limite diário; quem está no
                trial tem cota mensal. O rótulo fixo "hoje" fazia parecer que reseta amanhã. */}
            {usage.isTrial ? "Uso de IA neste mês (trial)" : "Uso de IA hoje"}: <strong>{usage.used}</strong>
            {usage.limit !== null ? ` / ${usage.limit}` : " (admin, sem limite)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={user.updatedAt.getTime()} action={updateUserAction} className="space-y-3">
            <input type="hidden" name="userId" value={user.id} />
            <label className="block space-y-1 text-sm font-medium">
              Papel
              <Select name="role" defaultValue={user.role}>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isBlocked" type="checkbox" defaultChecked={user.isBlocked} /> Bloqueado
            </label>
            <SubmitButton>Salvar conta</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Consumo medido do usuário. Vale em modo sombra também — é o único jeito de calibrar as cotas
 * antes de ligá-las, que é exatamente o que o modo sombra existe para permitir.
 */
async function ConsumoTab({ user }: { user: UserSummary }) {
  const report = await getUserUsageReport({ id: user.id, role: user.role });
  return <UserUsagePanel report={report} />;
}

async function ChatTab({ userId, page }: { userId: string; page: number }) {
  const [overview, total, rows] = await Promise.all([
    getUserChatOverview(userId),
    prisma.aiChatMessage.count({ where: { session: { userId } } }),
    prisma.aiChatMessage.findMany({
      where: { session: { userId } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CHAT_PAGE_SIZE,
      take: CHAT_PAGE_SIZE,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        sessionId: true,
        session: { select: { title: true } },
        questionSet: { select: { id: true, title: true, quantity: true } },
        studyMaterial: { select: { id: true, title: true } },
        _count: { select: { attachments: true } }
      }
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / CHAT_PAGE_SIZE));

  const messages: AdminChatMessageRow[] = rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    sessionId: row.sessionId,
    sessionTitle: row.session.title,
    attachments: row._count.attachments,
    questionSet: row.questionSet,
    studyMaterial: row.studyMaterial
  }));

  return (
    <div className="space-y-6">
      <UserChatOverviewCards overview={overview} />
      <UserChatMessages messages={messages} total={total} page={page} totalPages={totalPages} />
      <AdminPagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/usuarios/${userId}?tab=chat&page=${p}`}
      />
    </div>
  );
}

async function AssinaturaTab({ userId, page }: { userId: string; page: number }) {
  const [plans, coupons, subscriptions, total] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
    prisma.coupon.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.userSubscription.findMany({
      where: { userId },
      include: { plan: true, coupon: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SUBS_PAGE_SIZE,
      take: SUBS_PAGE_SIZE
    }),
    prisma.userSubscription.count({ where: { userId } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / SUBS_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assinatura</CardTitle>
          <CardDescription>Ativar manualmente um plano ou cancelar a assinatura ativa.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
          <form action={activateUserSubscriptionAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="userId" value={userId} />
            <Select name="planId" required>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
            <Select name="couponId" defaultValue="">
              <option value="">Sem cupom</option>
              {coupons.map((coupon) => (
                <option key={coupon.id} value={coupon.id}>
                  {coupon.code}
                </option>
              ))}
            </Select>
            <SubmitButton>Ativar</SubmitButton>
          </form>
          <form action={cancelUserSubscriptionAction}>
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton variant="outline">Cancelar ativa</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de assinaturas</CardTitle>
          <CardDescription>
            {total} registros · página {page} de {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Plano</th>
                <th>Status</th>
                <th>Cupom</th>
                <th>Início</th>
                <th>Fim</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{s.plan.name}</td>
                  <td>
                    <StatusBadge tone={statusTone(s.status)}>{s.status}</StatusBadge>
                  </td>
                  <td>{s.coupon?.code ?? "—"}</td>
                  <td>{formatDate(s.startsAt)}</td>
                  <td>{s.endsAt ? formatDate(s.endsAt) : "∞"}</td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-[var(--muted-foreground)]">
                    Nenhuma assinatura.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/usuarios/${userId}?tab=assinatura&page=${p}`} />
    </div>
  );
}

function SenhaTab({ userId, hasPassword }: { userId: string; hasPassword: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciar senha</CardTitle>
        <CardDescription>Defina uma senha manualmente, gere uma aleatória, ou envie um código de redefinição por e-mail.</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminPasswordTools userId={userId} hasPassword={hasPassword} />
      </CardContent>
    </Card>
  );
}

async function TransacoesTab({ userId, page, hasCpf }: { userId: string; page: number; hasCpf: boolean }) {
  const [transactions, total, checkouts, plans] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * TRANSACTIONS_PAGE_SIZE,
      take: TRANSACTIONS_PAGE_SIZE
    }),
    prisma.paymentTransaction.count({ where: { userId } }),
    prisma.paymentCheckoutSession.findMany({
      where: { userId },
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova cobrança Pix</CardTitle>
          <CardDescription>
            Gera um Pix pra esse cliente, mesmo que ele nunca tenha tentado pagar antes. O QR e o código copia-e-cola
            aparecem na lista logo abaixo pra você copiar e mandar manualmente — um e-mail com o código também sai
            automaticamente para ele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={issueUserPixChargeAction} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="userId" value={userId} />
            <Select name="planId" required defaultValue="" className="md:col-span-2">
              <option value="" disabled>
                Plano
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatMoney(plan.priceCents)}
                </option>
              ))}
            </Select>
            <Input name="amount" type="number" step="0.01" min="1" placeholder="Valor (opcional)" />
            {!hasCpf && (
              <Input name="cpf" placeholder="CPF do cliente (obrigatório — ele ainda não tem um salvo)" required className="md:col-span-3" />
            )}
            <SubmitButton>Gerar Pix</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {checkouts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">Checkouts Pix recentes</h3>
          {checkouts.map((checkout) => (
            <CheckoutRow key={checkout.id} checkout={checkout} showUserEmail={false} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
          <CardDescription>
            {total} registros · página {page} de {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Plano</th>
                <th>Provedor</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{t.plan.name}</td>
                  <td>{t.provider}</td>
                  <td>
                    <StatusBadge tone={statusTone(t.status)}>{t.status}</StatusBadge>
                  </td>
                  <td>{formatMoney(t.amountCents)}</td>
                  <td>{t.paidAt ? formatDate(t.paidAt) : "—"}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-[var(--muted-foreground)]">
                    Nenhuma transação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/usuarios/${userId}?tab=transacoes&page=${p}`} />
    </div>
  );
}

function PerigoTab({ userId, userName }: { userId: string; userName: string }) {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-red-700 dark:text-red-400">Zona de perigo</CardTitle>
        <CardDescription>
          Exclui permanentemente o usuário, cancela assinaturas ativas e apaga todos os logs de IA e histórico de chat.
          Os logs de auditoria do sistema são mantidos. Ação irreversível.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeleteUserButton userId={userId} userName={userName} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}
