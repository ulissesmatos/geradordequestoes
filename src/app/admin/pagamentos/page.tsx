import { updatePaymentGatewaySettingsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pagamentos</h1>
        <p className="text-[var(--muted-foreground)]">
          Configure Stripe, Mercado Pago Pix e acompanhe checkouts, transações e eventos de assinatura.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provedores</CardTitle>
          <CardDescription>Campos secretos em branco preservam o valor já salvo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePaymentGatewaySettingsAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="stripeSecretKey" type="password" placeholder={settings?.stripeSecretKey ? "Stripe secret configurada" : "Stripe secret key"} />
              <Input name="stripeWebhookSecret" type="password" placeholder={settings?.stripeWebhookSecret ? "Webhook secret configurado" : "Stripe webhook secret"} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input name="mercadoPagoAccessToken" type="password" placeholder={settings?.mercadoPagoAccessToken ? "Access token configurado" : "Mercado Pago access token"} />
              <Input name="mercadoPagoWebhookSecret" type="password" placeholder={settings?.mercadoPagoWebhookSecret ? "Webhook secret configurado" : "Mercado Pago webhook secret"} />
              <Input name="mercadoPagoPublicKey" defaultValue={settings?.mercadoPagoPublicKey ?? ""} placeholder="Mercado Pago public key" />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input name="testMode" type="checkbox" defaultChecked={settings?.testMode ?? true} /> Modo teste
              </label>
              <label className="flex items-center gap-2">
                <input name="stripePortalEnabled" type="checkbox" defaultChecked={settings?.stripePortalEnabled ?? true} /> Portal Stripe ativo
              </label>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm text-[var(--muted-foreground)]">
              Webhooks: <code>/api/webhooks/stripe</code> e <code>/api/webhooks/mercado-pago</code>.
            </div>
            <SubmitButton>Salvar provedores</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Checkouts recentes" value={checkouts.length} />
        <MetricCard label="Transações recentes" value={transactions.length} />
        <MetricCard label="Eventos recentes" value={events.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checkouts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Usuário</th>
                <th>Plano</th>
                <th>Provedor</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {checkouts.map((checkout) => (
                <tr key={checkout.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{checkout.user.email}</td>
                  <td>{checkout.plan.name}</td>
                  <td>{checkout.provider}</td>
                  <td>{checkout.status}</td>
                  <td>{formatMoney(checkout.amountCents)}</td>
                  <td>{formatDate(checkout.createdAt)}</td>
                </tr>
              ))}
              {checkouts.length === 0 && <EmptyRow colSpan={6} label="Nenhum checkout criado ainda." />}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2">Usuário</th>
                <th>Plano</th>
                <th>Provedor</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{transaction.user.email}</td>
                  <td>{transaction.plan.name}</td>
                  <td>{transaction.provider}</td>
                  <td>{transaction.status}</td>
                  <td>{formatMoney(transaction.amountCents)}</td>
                  <td>{transaction.paidAt ? formatDate(transaction.paidAt) : "-"}</td>
                </tr>
              ))}
              {transactions.length === 0 && <EmptyRow colSpan={6} label="Nenhuma transação registrada ainda." />}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de assinatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
              <strong>{event.type}</strong> / {event.provider} / {event.user.email}
              <span className="text-[var(--muted-foreground)]"> / {event.subscription?.plan.name ?? "sem plano"} / {formatDate(event.createdAt)}</span>
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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
