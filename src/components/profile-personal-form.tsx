"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updateProfileAction, type ProfileActionState } from "@/app/(app)/perfil/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCpf, formatPhone } from "@/lib/validation/cpf";

type Props = {
  name: string;
  cpf: string | null;
  phone: string | null;
  birthDate: string | null; // ISO yyyy-mm-dd ou null
};

export function ProfilePersonalForm({ name, cpf, phone, birthDate }: Props) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateProfileAction, null);
  const [cpfValue, setCpfValue] = useState(cpf ? formatCpf(cpf) : "");
  const [phoneValue, setPhoneValue] = useState(phone ? formatPhone(phone) : "");

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium">
        Nome completo
        <Input name="name" defaultValue={name} required minLength={2} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          CPF
          <Input
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpfValue}
            onChange={(e) => setCpfValue(formatCpf(e.target.value))}
            maxLength={14}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Telefone
          <Input
            name="phone"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            value={phoneValue}
            onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
            maxLength={16}
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Data de nascimento
        <Input name="birthDate" type="date" defaultValue={birthDate ?? ""} className="w-full sm:w-56" />
      </label>

      {state?.error && (
        <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Dados salvos com sucesso.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar dados
      </Button>
    </form>
  );
}
