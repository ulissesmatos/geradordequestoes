"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Copy, Loader2, QrCode, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  amountCents: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  /** ISO string do vencimento (ou null). */
  expiresAt: string | null;
  /** Endpoint GET que retorna { status: "approved" | "pending" | ... }. */
  statusUrl: string;
  /** Para onde ir quando aprovado (se omitido, mostra sucesso inline). */
  successRedirect?: string;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function PixPaymentPanel({ amountCents, qrCode, qrCodeBase64, expiresAt, statusUrl, successRedirect }: Props) {
  const router = useRouter();
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(expiresAt ? formatRemaining(expiresAt) : null);
  const [checking, setChecking] = useState(false);
  const stopped = useRef(false);

  const expired = remaining === "expirado" && !paid;

  const checkStatus = useCallback(async () => {
    if (stopped.current) return;
    try {
      const res = await fetch(statusUrl, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status?: string };
      if (data.status === "approved") {
        stopped.current = true;
        setPaid(true);
        if (successRedirect) router.push(successRedirect);
      }
    } catch {
      // rede instável: tenta de novo no próximo intervalo
    }
  }, [statusUrl, successRedirect, router]);

  useEffect(() => {
    const poll = setInterval(checkStatus, 6000);
    const tick = setInterval(() => {
      if (expiresAt) setRemaining(formatRemaining(expiresAt));
    }, 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [checkStatus, expiresAt]);

  async function copyCode() {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard indisponível (http) — seleção manual via textarea abaixo
    }
  }

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <h2 className="text-xl font-semibold text-emerald-800">Pagamento confirmado!</h2>
        <p className="text-sm text-emerald-700">
          {successRedirect ? "Redirecionando…" : "Tudo certo — o pagamento foi aprovado."}
        </p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-8 text-center">
        <XCircle className="h-12 w-12 text-[var(--muted-foreground)]" />
        <h2 className="text-xl font-semibold">Pix expirado</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          O prazo deste pagamento terminou. Gere uma nova cobrança para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">Valor a pagar</p>
        <p className="text-3xl font-bold">{formatMoney(amountCents)}</p>
        {remaining && (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <Clock className="h-3.5 w-3.5" />
            Expira em {remaining}
          </p>
        )}
      </div>

      {qrCodeBase64 ? (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code Pix"
            className="h-60 w-60 rounded-lg border border-[var(--border)] bg-white p-2"
          />
        </div>
      ) : (
        <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-[var(--border)]">
          <QrCode className="h-10 w-10 text-[var(--muted-foreground)]" />
        </div>
      )}

      <ol className="mx-auto max-w-sm list-decimal space-y-1 pl-5 text-sm text-[var(--muted-foreground)]">
        <li>Abra o app do seu banco e escolha pagar com <strong>Pix</strong>.</li>
        <li>Escaneie o QR Code acima <strong>ou</strong> use o código copia-e-cola.</li>
        <li>Confirme o pagamento — a aprovação aparece aqui em segundos.</li>
      </ol>

      {qrCode && (
        <div className="space-y-2">
          <textarea
            readOnly
            value={qrCode}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 font-mono text-xs text-[var(--muted-foreground)]"
            aria-label="Código Pix copia e cola"
          />
          <Button type="button" onClick={copyCode} className="w-full" variant={copied ? "secondary" : "default"}>
            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Código copiado!" : "Copiar código Pix"}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Aguardando pagamento…
        <button
          type="button"
          className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline disabled:opacity-60"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await checkStatus();
            setChecking(false);
          }}
        >
          Já paguei
        </button>
      </div>
    </div>
  );
}
