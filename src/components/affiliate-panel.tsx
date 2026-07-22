"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { requestAffiliateWithdrawalAction, type WithdrawalActionState } from "@/app/(app)/actions/affiliate-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Botão copiar do link de afiliado. */
export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={copied ? "secondary" : "default"}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          // clipboard indisponível (http): o campo ao lado permite copiar manualmente
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Link copiado!" : "Copiar link"}
    </Button>
  );
}

/** Formulário de solicitação de saque via Pix. */
export function WithdrawalForm({
  availableCents,
  minCents
}: {
  availableCents: number;
  minCents: number;
}) {
  const [state, formAction, pending] = useActionState<WithdrawalActionState, FormData>(
    requestAffiliateWithdrawalAction,
    null
  );
  const disabled = availableCents < minCents;

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Valor do saque (R$)
          <Input
            name="amount"
            type="number"
            step="0.01"
            min={(minCents / 100).toFixed(2)}
            max={(availableCents / 100).toFixed(2)}
            placeholder={`Mín. ${(minCents / 100).toFixed(2).replace(".", ",")}`}
            required
            disabled={disabled}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Chave Pix
          <Input name="pixKey" placeholder="CPF, e-mail, telefone ou chave aleatória" required disabled={disabled} />
        </label>
      </div>
      {state?.error && (
        <p className="flex items-center gap-1.5 rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-1.5 rounded-md bg-[var(--success-soft)] p-3 text-sm text-[var(--success-soft-foreground)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Saque solicitado! Você recebe na chave Pix informada assim que a equipe processar.
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending || disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Enviando..." : "Solicitar saque"}
        </Button>
        {disabled && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Saldo mínimo para saque: R$ {(minCents / 100).toFixed(2).replace(".", ",")}.
          </p>
        )}
      </div>
    </form>
  );
}
