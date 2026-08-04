import type { Prisma } from "@prisma/client";
import { CheckCircle2, ChevronDown, MessageCircle, QrCode, XCircle } from "lucide-react";
import {
  issueUserPixChargeAction,
  toggleTransactionRevenueAction,
  updatePaymentGatewaySettingsAction,
  updateStripePortalPolicyAction
} from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CopyButton } from "@/components/admin/copy-button";
import { SecretInput } from "@/components/admin/secret-input";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { maskSecret } from "@/lib/crypto";
import { formatDateTimeBR } from "@/lib/dates";
import { getRevenueSummary } from "@/lib/revenue";
import { onlyDigits } from "@/lib/validation/cpf";

const PAGE_SIZE = 20;

type PixMetadata = {
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

const TABS: AdminTabDef[] = [
  { value: "config", label: "Configuração" },
  { value: "checkouts", label: "Checkouts" },
  { value: "transacoes", label: "Transações" },
  { value: "eventos", label: "Eventos" }
];

export default async function AdminPaymentsPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const activeTab =
    params.tab === "checkouts" || params.tab === "transacoes" || params.tab === "eventos" ? params.tab : "config";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const q = (params.q ?? "").trim();

  const [checkoutCount, transactionCount, eventCount] = await Promise.all([
    prisma.paymentCheckoutSession.count(),
    prisma.paymentTransaction.count(),
    prisma.subscriptionEvent.count()
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pagamentos"
        description="Configure Stripe e Mercado Pago. Campos de chave deixados em branco mantêm o valor já salvo."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Checkouts" value={checkoutCount} />
        <MetricCard label="Transações" value={transactionCount} />
        <MetricCard label="Eventos" value={eventCount} />
      </div>

      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/pagamentos" />

      {activeTab === "config" && <ConfigTab />}
      {activeTab === "checkouts" && <CheckoutsTab page={page} total={checkoutCount} q={q} />}
      {activeTab === "transacoes" && <TransactionsTab page={page} total={transactionCount} />}
      {activeTab === "eventos" && <EventsTab page={page} total={eventCount} />}
    </div>
  );
}

async function ConfigTab() {
  const settings = await prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } });
  const stripeKeyMasked = maskSecret(settings?.stripeSecretKey ?? null);
  const stripeWebhookMasked = maskSecret(settings?.stripeWebhookSecret ?? null);
  const mpTokenMasked = maskSecret(settings?.mercadoPagoAccessToken ?? null);
  const mpWebhookMasked = maskSecret(settings?.mercadoPagoWebhookSecret ?? null);

  return (
    <form key={settings?.updatedAt.getTime() ?? "new"} action={updatePaymentGatewaySettingsAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>
            Checkout de cartão de crédito/débito. Webhook: <code className="text-xs">/api/webhooks/stripe</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SecretInput name="stripeSecretKey" label="Secret key" masked={stripeKeyMasked} placeholder="sk_live_... ou sk_test_..." />

          <SecretInput
            name="stripeWebhookSecret"
            label="Webhook signing secret"
            masked={stripeWebhookMasked}
            placeholder="whsec_..."
            help="Stripe Dashboard → Developers → Webhooks → Signing secret."
          />

          <div className="md:col-span-2 flex flex-wrap gap-4 text-sm pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="stripePortalEnabled" type="checkbox" defaultChecked={settings?.stripePortalEnabled ?? true} />
              Portal do cliente Stripe ativo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="testMode" type="checkbox" defaultChecked={settings?.testMode ?? true} />
              Modo teste
            </label>
          </div>
        </CardContent>
      </Card>

      <StripePolicyCard settings={settings} />

      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago</CardTitle>
          <CardDescription>
            Pix / boleto. Webhook: <code className="text-xs">/api/webhooks/mercado-pago</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <SecretInput name="mercadoPagoAccessToken" label="Access token (secret)" masked={mpTokenMasked} placeholder="APP_USR-..." />

          <SecretInput name="mercadoPagoWebhookSecret" label="Webhook secret" masked={mpWebhookMasked} placeholder="Secret do webhook" />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Public key</span>
              {settings?.mercadoPagoPublicKey ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Configurada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted-foreground)]">
                  <XCircle className="h-3.5 w-3.5" />
                  Não configurada
                </span>
              )}
            </div>
            <Input name="mercadoPagoPublicKey" defaultValue={settings?.mercadoPagoPublicKey ?? ""} placeholder="APP_USR-... (public)" />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Chave pública (não é segredo).</p>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1.5 block text-sm font-medium">Modo de checkout Pix</label>
            <select
              name="mercadoPagoCheckoutMode"
              defaultValue={settings?.mercadoPagoCheckoutMode ?? "CHECKOUT_PRO"}
              className="h-10 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            >
              <option value="CHECKOUT_PRO">Checkout Pro — redireciona para a página do Mercado Pago</option>
              <option value="TRANSPARENT">Transparente — QR Code Pix exibido em página própria do site</option>
            </select>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              No modo transparente o aluno paga sem sair do site: mostramos o QR Code e o copia-e-cola, e o acesso libera
              sozinho na aprovação.
            </p>
          </div>

          <label className="block md:col-span-3">
            <span className="mb-1.5 block text-sm font-medium">Lembrete de Pix pendente</span>
            <div className="flex max-w-xs items-center gap-2">
              <Input
                name="pixReminderAfterHours"
                type="number"
                min={1}
                defaultValue={settings?.pixReminderAfterHours ?? 3}
                className="w-24"
              />
              <span className="text-sm text-[var(--muted-foreground)]">horas sem pagar até enviar o e-mail de lembrete</span>
            </div>
          </label>
        </CardContent>
      </Card>

      <SubmitButton className="w-full md:w-auto">Salvar configurações</SubmitButton>
    </form>
  );
}

function StripePolicyCard({ settings }: { settings: Prisma.PaymentGatewaySettingGetPayload<object> | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Política de assinatura (Stripe)</CardTitle>
        <CardDescription>
          Vale tanto para o portal self-service do cliente (onde ele cancela/troca de plano sozinho) quanto para o
          botão de cancelar assinatura aqui no painel admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateStripePortalPolicyAction} className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Cancelamento</span>
            <Select name="stripeCancelMode" defaultValue={settings?.stripeCancelMode ?? "AT_PERIOD_END"}>
              <option value="AT_PERIOD_END">No fim do período pago</option>
              <option value="IMMEDIATE">Imediato</option>
            </Select>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              &quot;No fim do período&quot; mantém o acesso do cliente até a data que ele já pagou, mesmo cancelando antes.
            </p>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Proração ao trocar de plano</span>
            <Select name="stripeProrationBehavior" defaultValue={settings?.stripeProrationBehavior ?? "CREATE_PRORATIONS"}>
              <option value="CREATE_PRORATIONS">Cobra a diferença na hora</option>
              <option value="NONE">Sem proração</option>
            </Select>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Só afeta o portal self-service — troca de plano feita aqui no admin não mexe na cobrança da Stripe.
            </p>
          </label>
          <p className="text-xs text-[var(--muted-foreground)] md:col-span-2">
            Salvar sincroniza com a Stripe na hora (billing portal configuration) — precisa da Secret key configurada
            acima. Só afeta planos com preço da Stripe cadastrado (Admin → Planos).
          </p>
          <div className="md:col-span-2">
            <SubmitButton variant="outline">Salvar política</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

async function CheckoutsTab({ page, total, q }: { page: number; total: number; q: string }) {
  const where: Prisma.PaymentCheckoutSessionWhereInput = q ? { user: { email: { contains: q, mode: "insensitive" } } } : {};
  const [checkouts, filteredTotal, plans] = await Promise.all([
    prisma.paymentCheckoutSession.findMany({
      where,
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    q ? prisma.paymentCheckoutSession.count({ where }) : Promise.resolve(total),
    prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const buildHref = (p: number) => `/admin/pagamentos?${new URLSearchParams({ tab: "checkouts", ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova cobrança Pix</CardTitle>
          <CardDescription>
            Gera um Pix avulso para um cliente pelo e-mail. O QR e o código copia-e-cola aparecem na lista abaixo pra
            você copiar e mandar manualmente (por e-mail ou WhatsApp) — um e-mail com o código também é enviado
            automaticamente para o cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={issueUserPixChargeAction} className="grid gap-3 md:grid-cols-4">
            <Input name="email" type="email" placeholder="E-mail do cliente" required className="md:col-span-2" />
            <Select name="planId" required defaultValue="">
              <option value="" disabled>
                Plano
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatMoney(plan.priceCents)}
                </option>
              ))}
            </Select>
            <Input name="amount" type="number" step="0.01" min="1" placeholder="Valor (opcional, sobrescreve o do plano)" />
            <Input name="cpf" placeholder="CPF do cliente (só se ele ainda não tiver salvo)" className="md:col-span-3" />
            <SubmitButton>Gerar Pix</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="checkouts" />
        <Input name="q" defaultValue={q} placeholder="Buscar por e-mail do cliente..." className="max-w-sm" />
        <SubmitButton variant="outline">Buscar</SubmitButton>
        <span className="text-sm text-[var(--muted-foreground)]">
          {filteredTotal} {filteredTotal === 1 ? "registro" : "registros"} · página {page} de {totalPages}
        </span>
      </form>

      <div className="space-y-3">
        {checkouts.length === 0 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum checkout encontrado.
          </p>
        )}
        {checkouts.map((c) => (
          <CheckoutRow key={c.id} checkout={c} />
        ))}
      </div>
      <AdminPagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}

function checkoutDisplayStatus(status: string, expiresAt: Date | null): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (status === "COMPLETED") return { label: "Aprovado", tone: "success" };
  if (status === "CANCELED" || status === "ERROR") return { label: status === "CANCELED" ? "Cancelado" : "Erro", tone: "danger" };
  // O checkout nunca transiciona pra EXPIRED sozinho no banco — calculamos aqui na leitura em
  // vez de rodar um job só pra isso.
  if (status === "PENDING" && expiresAt && expiresAt.getTime() < Date.now()) return { label: "Expirado", tone: "neutral" };
  return { label: "Pendente", tone: "warning" };
}

function CheckoutRow({
  checkout
}: {
  checkout: Prisma.PaymentCheckoutSessionGetPayload<{ include: { user: true; plan: true } }>;
}) {
  const display = checkoutDisplayStatus(checkout.status, checkout.expiresAt);
  const metadata = (checkout.metadata ?? {}) as PixMetadata;
  const tx = checkout.provider === "MERCADO_PAGO" ? metadata.point_of_interaction?.transaction_data : undefined;
  const hasPix = Boolean(tx?.qr_code || tx?.qr_code_base64);
  const waPhone = onlyDigits(checkout.user.phone ?? "");
  const waMessage = tx?.qr_code
    ? `Olá! Segue o código Pix para pagar o plano ${checkout.plan.name} (${formatMoney(checkout.amountCents)}):\n\n${tx.qr_code}`
    : "";

  return (
    <Card className="overflow-hidden">
      <details className="group">
        <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden hover:bg-[var(--surface-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
                <StatusBadge tone="neutral">{checkout.provider}</StatusBadge>
                {hasPix && (
                  <StatusBadge tone="info">
                    <QrCode className="h-3 w-3" /> Pix disponível
                  </StatusBadge>
                )}
              </div>
              <p className="text-sm font-medium">
                {checkout.user.email} · {checkout.plan.name}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {formatMoney(checkout.amountCents)} · criado em {formatDate(checkout.createdAt)}
                {checkout.expiresAt ? ` · expira em ${formatDate(checkout.expiresAt)}` : ""}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <div className="border-t border-[var(--border)] p-4">
          {hasPix ? (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              {tx?.qr_code_base64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${tx.qr_code_base64}`}
                  alt="QR Code Pix"
                  className="h-40 w-40 rounded-lg border border-[var(--border)] bg-white p-2"
                />
              )}
              <div className="space-y-2">
                {tx?.qr_code && (
                  <>
                    <textarea
                      readOnly
                      value={tx.qr_code}
                      rows={3}
                      className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 font-mono text-xs text-[var(--muted-foreground)]"
                      aria-label="Código Pix copia e cola"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyButton value={tx.qr_code} label="Copiar código Pix" />
                      {waPhone && (
                        <a
                          href={`https://wa.me/55${waPhone}?text=${encodeURIComponent(waMessage)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold transition hover:bg-[var(--surface-subtle)]"
                        >
                          <MessageCircle className="h-3 w-3" />
                          Enviar por WhatsApp
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {checkout.provider === "MERCADO_PAGO"
                ? "Este checkout não tem QR Code local (provavelmente foi criado no modo Checkout Pro, que redireciona para a página do Mercado Pago)."
                : "Checkout via Stripe — pagamento por cartão, sem QR Pix."}
            </p>
          )}
        </div>
      </details>
    </Card>
  );
}

async function TransactionsTab({ page, total }: { page: number; total: number }) {
  const [transactions, revenue] = await Promise.all([
    prisma.paymentTransaction.findMany({
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    getRevenueSummary()
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
          <CardDescription>
            {total} registros · página {page} de {totalPages} · Receita registrada: <strong>{formatMoney(revenue.realCents)}</strong>
            {revenue.excludedCount > 0 && (
              <> · fora da conta: {formatMoney(revenue.excludedCents)} em {revenue.excludedCount} transação(ões)</>
            )}
            . Use &quot;Tirar do caixa&quot; para não contabilizar cobranças de teste, cortesias ou estornos feitos fora do
            gateway — a transação continua no histórico, só sai do total. Assinatura liberada manualmente no painel do
            usuário não gera transação nenhuma e nunca entra aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Usuário</th>
                <th>Plano</th>
                <th>Provedor</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Pago em</th>
                <th>Receita</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{t.user.email}</td>
                  <td>{t.plan.name}</td>
                  <td>{t.provider}</td>
                  <td>{t.status}</td>
                  <td className={t.countsAsRevenue ? undefined : "text-[var(--muted-foreground)] line-through"}>
                    {formatMoney(t.amountCents)}
                  </td>
                  <td>{t.paidAt ? formatDate(t.paidAt) : "—"}</td>
                  <td>
                    <form action={toggleTransactionRevenueAction} className="flex items-center gap-2">
                      <input type="hidden" name="transactionId" value={t.id} />
                      <SubmitButton variant="outline" size="sm">
                        {t.countsAsRevenue ? "Tirar do caixa" : "Voltar ao caixa"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && <EmptyRow colSpan={7} label="Nenhuma transação registrada ainda." />}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/pagamentos?tab=transacoes&page=${p}`} />
    </div>
  );
}

async function EventsTab({ page, total }: { page: number; total: number }) {
  const events = await prisma.subscriptionEvent.findMany({
    include: { user: true, subscription: { include: { plan: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Eventos de assinatura</CardTitle>
          <CardDescription>
            {total} registros · página {page} de {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
              <strong>{ev.type}</strong> · {ev.provider} · {ev.user.email}
              <span className="text-[var(--muted-foreground)]"> · {ev.subscription?.plan.name ?? "sem plano"} · {formatDate(ev.createdAt)}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum evento registrado ainda.</p>}
        </CardContent>
      </Card>
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/pagamentos?tab=eventos&page=${p}`} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{value}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="py-5 text-center text-[var(--muted-foreground)]" colSpan={colSpan}>
        {label}
      </td>
    </tr>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return formatDateTimeBR(date);
}
