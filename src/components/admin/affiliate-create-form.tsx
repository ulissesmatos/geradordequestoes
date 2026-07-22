"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { createAffiliateAction, type AffiliateAdminState } from "@/app/admin/afiliados/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AffiliateCreateForm() {
  const [state, formAction, pending] = useActionState<AffiliateAdminState, FormData>(createAffiliateAction, null);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Input name="email" type="email" placeholder="E-mail da conta do aluno" required className="md:col-span-2" />
        <Input name="commissionPercent" type="number" min={1} max={90} defaultValue={20} placeholder="% de comissão" required />
      </div>
      {state?.error && (
        <p className="flex items-center gap-1.5 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Afiliado criado! O link já aparece na lista abaixo e no perfil do aluno.
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Criando..." : "Criar afiliado"}
        </Button>
      </div>
    </form>
  );
}
