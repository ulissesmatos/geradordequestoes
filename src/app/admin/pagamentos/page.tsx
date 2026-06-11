import { CheckCircle2, XCircle } from "lucide-react";
import { updatePaymentGatewaySettingsAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SecretInput } from "@/components/admin/secret-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { maskSecret } from "@/lib/crypto";

export default async function AdminPaymentsPage() {
  const [settings, checkouts, transactions, events] = await Promise.all([
    prisma.paymentGatewaySetting.findUnique({ where: { id: "default" } }),
    prisma.paymentCheckoutSession.findMany({
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.paymentTransaction.findMany({
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.subscriptionEvent.findMany({
      include: { user: true, subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const stripeKeyMasked = maskSecret(settings?.stripeSecretKey ?? null);
  const stripeWebhookMasked = maskSecret(settings?.stripeWebhookSecret ?? null);
  const mpTokenMasked = maskSecret(settings?.mercadoPagoAccessToken ?? null);
  const mpWebhookMasked = maskSecret(settings?.mercadoPagoWebhookSecret ?? null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pagamentos"
        description="Configure Stripe e Mercado Pago. Campos de chave deixados em branco mantêm o valor já salvo."
      />

      <form action={updatePaymentGatewaySettingsAction} className="space-y-4">
        {/* ── Stripe ── */}
        <Card>
          <CardHeader>
            <CardTitle>Stripe</CardTitle>
            <CardDescription>
              Checkout de cartão de crédito/débito. Webhook: <code className="text-xs">/api/webhooks/stripe</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <SecretInput
              name="stripeSecretKey"
              label="Secret key"
              masked={stripeKeyMasked}
              placeholder="sk_live_... ou sk_test_..."
            />

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

        {/* ── Mercado Pago ── */}
        <Card>
          <CardHeader>
            <CardTitle>Mercado Pago</CardTitle>
            <CardDescription>
              Pix / boleto. Webhook: <code className="text-xs">/api/webhooks/mercado-pago</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SecretInput
              name="mercadoPagoAccessToken"
              label="Access token (secret)"
              masked={mpTokenMasked}
              placeholder="APP_USR-..."
            />

            <SecretInput
              name="mercadoPagoWebhookSecret"
              label="Webhook secret"
              masked={mpWebhookMasked}
              placeholder="Secret do webhook"
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Public key</span>
                {settings?.mercadoPagoPublicKey ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Configurada</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted-foreground)]"><XCircle className="h-3.5 w-3.5" />Não configurada</span>
                )}
              </div>
              <Input
                name="mercadoPagoPublicKey"
                defaultValue={settings?.mercadoPagoPublicKey ?? ""}
                placeholder="APP_USR-... (public)"
              />
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
                No modo transparente o aluno paga sem sair do site: mostramos o QR Code e o copia-e-cola, e o acesso
                libera sozinho na aprovação.
              </p>
            </div>
          </CardContent>
        </Card>

        <SubmitButton className="w-full md:w-auto">Salvar configurações</SubmitButton>
      </form>

      {/* ── Métricas ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Checkouts recentes" value={checkouts.length} />
        <MetricCard label="Transações recentes" value={transactions.length} />
        <MetricCard label="Eventos recentes" value={events.length} />
      </div>

      {/* ── Checkouts ── */}
      <Card>
        <CardHeader><CardTitle>Checkouts</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Usuário</th><th>Plano</th><th>Provedor</th>
                <th>Status</th><th>Valor</th><th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {checkouts.map((c) => (
                <tr key={c.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{c.user.email}</td>
                  <td>{c.plan.name}</td>
                  <td>{c.provider}</td>
                  <td>{c.status}</td>
                  <td>{formatMoney(c.amountCents)}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              ))}
              {checkouts.length === 0 && <EmptyRow colSpan={6} label="Nenhum checkout criado ainda." />}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Transações ── */}
      <Card>
        <CardHeader><CardTitle>Transações</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Usuário</th><th>Plano</th><th>Provedor</th>
                <th>Status</th><th>Valor</th><th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{t.user.email}</td>
                  <td>{t.plan.name}</td>
                  <td>{t.provider}</td>
                  <td>{t.status}</td>
                  <td>{formatMoney(t.amountCents)}</td>
                  <td>{t.paidAt ? formatDate(t.paidAt) : "—"}</td>
                </tr>
              ))}
              {transactions.length === 0 && <EmptyRow colSpan={6} label="Nenhuma transação registrada ainda." />}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Eventos ── */}
      <Card>
        <CardHeader><CardTitle>Eventos de assinatura</CardTitle></CardHeader>
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
      <td className="py-5 text-center text-[var(--muted-foreground)]" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
