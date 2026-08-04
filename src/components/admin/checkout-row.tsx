import type { Prisma } from "@prisma/client";
import { ChevronDown, MessageCircle, QrCode } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { onlyDigits } from "@/lib/validation/cpf";

export type PixMetadata = {
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export function checkoutDisplayStatus(
  status: string,
  expiresAt: Date | null
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (status === "COMPLETED") return { label: "Aprovado", tone: "success" };
  if (status === "CANCELED" || status === "ERROR") return { label: status === "CANCELED" ? "Cancelado" : "Erro", tone: "danger" };
  // O checkout nunca transiciona pra EXPIRED sozinho no banco — calculamos aqui na leitura em
  // vez de rodar um job só pra isso.
  if (status === "PENDING" && expiresAt && expiresAt.getTime() < Date.now()) return { label: "Expirado", tone: "neutral" };
  return { label: "Pendente", tone: "warning" };
}

/**
 * Card colapsável de um PaymentCheckoutSession com QR Code + copia-e-cola pra quando for Pix do
 * Mercado Pago — usado em /admin/pagamentos (aba Checkouts) e /admin/usuarios/[id] (aba
 * Transações), sempre com o mesmo visual. Sem polling de propósito: é consulta do admin sobre o
 * que já está gravado, não a tela de pagamento do cliente (essa é PixPaymentPanel).
 */
export function CheckoutRow({
  checkout,
  showUserEmail = true
}: {
  checkout: Prisma.PaymentCheckoutSessionGetPayload<{ include: { user: true; plan: true } }>;
  /** false quando já se está na página do próprio usuário — o e-mail dele é redundante ali. */
  showUserEmail?: boolean;
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
                {showUserEmail ? `${checkout.user.email} · ${checkout.plan.name}` : checkout.plan.name}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {formatMoney(checkout.amountCents)} · criado em {formatDateTimeBR(checkout.createdAt)}
                {checkout.expiresAt ? ` · expira em ${formatDateTimeBR(checkout.expiresAt)}` : ""}
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

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
