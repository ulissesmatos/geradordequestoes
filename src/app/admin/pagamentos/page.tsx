import { CheckCircle2, XCircle } from "lucide-react";
import { updatePaymentGatewaySettingsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

function maskSecret(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    const plain = decryptSecret(encrypted);
    if (!plain) return null;
    // Show prefix type hint + masked middle, e.g. "sk_test_••••••••"
    const prefix = plain.slice(0, 10);
    return `${prefix}${"•".repeat(12)}`;
  } catch {
    return "••••••••••••";
  }
}

function KeyStatus({ configured, masked }: { configured: boolean; masked: string | null }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Configurada{masked ? `: ${masked}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted-foreground)]">
      <XCircle className="h-3.5 w-3.5" />
      Não configurada
    </span>
  );
}

function FieldLabel({ label, status }: { label: string; status: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      {status}
    </div>
  );
}

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
      <div>
        <h1 className="text-3xl font-bold">Pagamentos</h1>
        <p className="text-[var(--muted-foreground)]">
          Configure Stripe e Mercado Pago. Campos de chave deixados em branco mantêm o valor já salvo.
        </p>
      </div>

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
            <div>
              <FieldLabel
                label="Secret key"
                status={<KeyStatus configured={!!settings?.stripeSecretKey} masked={stripeKeyMasked} />}
              />
              <Input
                name="stripeSecretKey"
                type="password"
                placeholder="sk_live_... ou sk_test_..."
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Deixe vazio para manter a chave atual.</p>
            </div>

            <div>
              <FieldLabel
                label="Webhook signing secret"
                status={<KeyStatus configured={!!settings?.stripeWebhookSecret} masked={stripeWebhookMasked} />}
              />
              <Input
                name="stripeWebhookSecret"
                type="password"
                placeholder="whsec_..."
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Stripe Dashboard → Developers → Webhooks → Signing secret.
              </p>
            </div>

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
            <div>
              <FieldLabel
                label="Access token (secret)"
                status={<KeyStatus configured={!!settings?.mercadoPagoAccessToken} masked={mpTokenMasked} />}
              />
              <Input
                name="mercadoPagoAccessToken"
                type="password"
                placeholder="APP_USR-..."
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Deixe vazio para manter.</p>
            </div>

            <div>
              <FieldLabel
                label="Webhook secret"
                status={<KeyStatus configured={!!settings?.mercadoPagoWebhookSecret} masked={mpWebhookMasked} />}
              />
              <Input
                name="mercadoPagoWebhookSecret"
                type="password"
                placeholder="Secret do webhook"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Deixe vazio para manter.</p>
            </div>

            <div>
              <FieldLabel
                label="Public key"
                status={
                  settings?.mercadoPagoPublicKey
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Configurada</span>
                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted-foreground)]"><XCircle className="h-3.5 w-3.5" />Não configurada</span>
                }
              />
              <Input
                name="mercadoPagoPublicKey"
                defaultValue={settings?.mercadoPagoPublicKey ?? ""}
                placeholder="APP_USR-... (public)"
              />
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
