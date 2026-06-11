"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CLEAR_SECRET = "__CLEAR__";

type Props = {
  /** Nome do campo no FormData (a action usa o mesmo nome). */
  name: string;
  label: string;
  /** Valor mascarado vindo do servidor (ex.: "sk_test_••••"), ou null se não configurado. */
  masked: string | null;
  placeholder?: string;
  /** Texto de ajuda adicional abaixo do campo. */
  help?: React.ReactNode;
};

/**
 * Campo de chave secreta padronizado para o admin:
 * - toggle mostrar/ocultar
 * - badge de status (configurada/não)
 * - checkbox "Remover chave" que envia o sentinela __CLEAR__ (resolvido por resolveSecretUpdate)
 * - vazio mantém a chave atual
 */
export function SecretInput({ name, label, masked, placeholder, help }: Props) {
  const configured = !!masked;
  const [show, setShow] = useState(false);
  const [clear, setClear] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {configured ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Configurada: {masked}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted-foreground)]">
            <XCircle className="h-3.5 w-3.5" />
            Não configurada
          </span>
        )}
      </div>

      <div className="relative">
        {/* Quando "remover" está marcado, o input visível perde o name (não submete)
            e um hidden carrega o sentinela __CLEAR__. */}
        {clear && <input type="hidden" name={name} value={CLEAR_SECRET} />}
        <Input
          name={clear ? undefined : name}
          type={show ? "text" : "password"}
          placeholder={clear ? "A chave será removida ao salvar" : placeholder}
          autoComplete="off"
          disabled={clear}
          className={cn("pr-10", clear && "opacity-60")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? "Ocultar" : "Mostrar"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted-foreground)]">
          {help ?? "Deixe em branco para manter a chave atual."}
        </p>
        {configured && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--destructive)]">
            <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
            Remover chave
          </label>
        )}
      </div>
    </div>
  );
}
