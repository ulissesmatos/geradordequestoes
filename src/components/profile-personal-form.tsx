"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { updateProfileAction, type ProfileActionState } from "@/app/(app)/perfil/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCpf, formatPhone, isValidCpf, onlyDigits } from "@/lib/validation/cpf";

type Props = {
  name: string;
  cpf: string | null;
  phone: string | null;
  birthDate: string | null; // ISO yyyy-mm-dd ou null
};

export function ProfilePersonalForm({ name, cpf, phone, birthDate }: Props) {
  const isLocked = !!cpf;

  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateProfileAction, null);
  const [nameValue, setNameValue] = useState(name);
  const [cpfValue, setCpfValue] = useState(cpf ? formatCpf(cpf) : "");
  const [phoneValue, setPhoneValue] = useState(phone ? formatPhone(phone) : "");
  const [birthValue, setBirthValue] = useState(birthDate ?? "");
  const [reviewing, setReviewing] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleReview() {
    setClientError(null);
    if (nameValue.trim().length < 2) {
      setClientError("Informe o nome completo.");
      return;
    }
    const digits = onlyDigits(cpfValue);
    if (!digits) {
      setClientError("CPF é obrigatório.");
      return;
    }
    if (!isValidCpf(digits)) {
      setClientError("CPF inválido. Verifique os números digitados.");
      return;
    }
    if (!birthValue) {
      setClientError("Informe a data de nascimento.");
      return;
    }
    setReviewing(true);
  }

  /* ── Estado bloqueado: CPF já confirmado ── */
  if (isLocked) {
    const formattedBirth = birthDate
      ? new Date(birthDate + "T12:00:00").toLocaleDateString("pt-BR")
      : "—";

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 border border-emerald-200">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Dados fiscais confirmados.</span>{" "}
            Esses campos não podem ser alterados.
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 rounded-md border bg-[var(--surface)] p-4 text-sm">
          <div>
            <p className="mb-0.5 text-xs font-medium text-[var(--muted-foreground)]">Nome completo</p>
            <p className="font-semibold">{name}</p>
          </div>
          <div>
            <p className="mb-0.5 text-xs font-medium text-[var(--muted-foreground)]">CPF</p>
            <p className="font-semibold">{formatCpf(cpf)}</p>
          </div>
          <div>
            <p className="mb-0.5 text-xs font-medium text-[var(--muted-foreground)]">Data de nascimento</p>
            <p className="font-semibold">{formattedBirth}</p>
          </div>
        </div>

        {/* Telefone sempre editável */}
        <form action={formAction} className="space-y-4">
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

          {state?.error && (
            <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Telefone salvo com sucesso.
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar telefone
          </Button>
        </form>
      </div>
    );
  }

  /* ── Estado de revisão: confirmação antes de salvar ── */
  if (reviewing) {
    const cpfDigits = onlyDigits(cpfValue);
    const formattedBirth = birthValue
      ? new Date(birthValue + "T12:00:00").toLocaleDateString("pt-BR")
      : "—";

    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-semibold">
              Atenção: após confirmar, nome, CPF e data de nascimento não poderão ser alterados.
            </p>
          </div>
        </div>

        <div className="rounded-md border bg-[var(--surface)] p-4 space-y-3">
          <p className="text-sm font-semibold">Confirme seus dados antes de salvar</p>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Nome completo</p>
              <p className="font-semibold">{nameValue.trim()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">CPF</p>
              <p className="font-semibold">{formatCpf(cpfDigits)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Data de nascimento</p>
              <p className="font-semibold">{formattedBirth}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Telefone</p>
              <p className="font-semibold">{phoneValue || "—"}</p>
            </div>
          </div>
        </div>

        {state?.error && (
          <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
            {state.error}
          </p>
        )}

        <form action={formAction} className="flex flex-wrap gap-3">
          <input type="hidden" name="name" value={nameValue.trim()} />
          <input type="hidden" name="cpf" value={cpfDigits} />
          <input type="hidden" name="phone" value={onlyDigits(phoneValue)} />
          <input type="hidden" name="birthDate" value={birthValue} />
          <input type="hidden" name="confirmed" value="true" />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar e salvar
          </Button>
          <Button type="button" variant="outline" onClick={() => setReviewing(false)}>
            Voltar e editar
          </Button>
        </form>
      </div>
    );
  }

  /* ── Estado padrão: edição ── */
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm font-medium">
        Nome completo
        <Input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          required
          minLength={2}
          placeholder="Seu nome completo"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          CPF
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpfValue}
            onChange={(e) => setCpfValue(formatCpf(e.target.value))}
            maxLength={14}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Telefone <span className="font-normal text-[var(--muted-foreground)]">(editável depois)</span>
          <Input
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
        <Input
          type="date"
          value={birthValue}
          onChange={(e) => setBirthValue(e.target.value)}
          className="w-full sm:w-56"
        />
      </label>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Nome, CPF e data de nascimento não poderão ser alterados após a confirmação.
      </div>

      {clientError && (
        <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
          {clientError}
        </p>
      )}

      <Button type="button" onClick={handleReview}>
        Revisar dados
      </Button>
    </div>
  );
}
