"use client";

import { useActionState, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { saveCheckoutCpfAction, type CheckoutCpfState } from "@/app/checkout/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCpf } from "@/lib/validation/cpf";

export function CheckoutCpfStep({ planSlug, planName, couponCode }: { planSlug: string; planName: string; couponCode?: string }) {
  const [state, formAction, pending] = useActionState<CheckoutCpfState, FormData>(saveCheckoutCpfAction, null);
  const [cpfValue, setCpfValue] = useState("");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-[var(--accent)]" />
            Confirme seu CPF
          </CardTitle>
          <CardDescription>
            Para pagar o plano <strong>{planName}</strong> via Pix, precisamos do seu CPF (exigido para gerar a cobrança).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="plan" value={planSlug} />
            {couponCode && <input type="hidden" name="coupon" value={couponCode} />}
            <label className="block space-y-1 text-sm font-medium">
              CPF
              <Input
                name="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpfValue}
                onChange={(e) => setCpfValue(formatCpf(e.target.value))}
                maxLength={14}
                autoFocus
                required
              />
            </label>
            {state?.error && (
              <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Continuar para o Pix
            </Button>
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              Seu CPF fica salvo no seu perfil e é usado apenas para a cobrança e fins fiscais.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
