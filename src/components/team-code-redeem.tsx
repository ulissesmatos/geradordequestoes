"use client";

import { useActionState } from "react";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { redeemTeamCodeAction, type RedeemCodeState } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamCodeRedeem() {
  const [state, formAction, pending] = useActionState<RedeemCodeState, FormData>(redeemTeamCodeAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="code"
          placeholder="Código da empresa (ex.: ABCD2345)"
          className="uppercase tracking-wider"
          autoComplete="off"
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Aplicar código
        </Button>
      </div>

      {state?.ok && (
        <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {state.message ?? "Código aplicado!"}
        </p>
      )}
      {state?.error && (
        <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>
      )}
    </form>
  );
}
