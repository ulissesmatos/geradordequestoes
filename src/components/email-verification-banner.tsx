"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MailWarning, Pencil, X } from "lucide-react";
import { requestEmailCodeAction, updateUnverifiedEmailAction, verifyEmailCodeAction } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Cartão flutuante (fixed, fora do fluxo do documento) em vez de faixa de topo —
 * uma faixa empurrando o conteúdo para baixo quebrava páginas com altura calculada
 * em 100svh (ex.: o chat), gerando scroll extra e cortando o campo de input.
 */
export function EmailVerificationBanner({ email }: { email: string | null }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resendPending, startResend] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, verifyPending] = useActionState(verifyEmailCodeAction, null);
  const [emailState, emailFormAction, emailPending] = useActionState(updateUnverifiedEmailAction, null);

  useEffect(() => {
    if (state?.ok) {
      setNotice("E-mail verificado com sucesso!");
      const t = setTimeout(() => router.refresh(), 900);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  useEffect(() => {
    if (emailState?.ok) {
      setEditing(false);
      setOpen(true);
      setNotice(emailState.message ?? "E-mail atualizado. Enviamos um novo código.");
      router.refresh();
    }
  }, [emailState, router]);

  function resend() {
    setNotice(null);
    startResend(async () => {
      const result = await requestEmailCodeAction();
      setNotice(result.message ?? (result.ok ? "Código reenviado. Confira seu e-mail." : null));
      if (result.ok) setOpen(true);
    });
  }

  const floatingCardClass = "fixed right-4 top-20 z-40 w-[calc(100vw-2rem)] max-w-sm animate-fade-in";

  if (dismissed || state?.ok) {
    if (state?.ok) {
      return (
        <div className={cn(floatingCardClass, "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 shadow-lg")}>
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          {notice ?? "E-mail verificado!"}
        </div>
      );
    }
    return null;
  }

  return (
    <div className={cn(floatingCardClass, "rounded-lg border border-amber-200 bg-amber-50 text-amber-900 shadow-lg")}>
      <div className="flex items-start gap-2 p-3">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 text-sm">
          <p>
            Confirme seu e-mail{email ? <> <strong className="break-all">{email}</strong></> : null} para proteger sua conta.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              setNotice(null);
            }}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 underline-offset-2 hover:underline"
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Cancelar" : "Não é seu e-mail?"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dispensar"
          className="shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (!notice) resend();
            }}
            className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Confirmar agora
          </button>
        ) : (
          <div className="space-y-1.5">
            <form action={formAction} className="flex items-center gap-2">
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="h-8 flex-1 text-center tracking-[0.3em]"
                aria-label="Código de verificação"
              />
              <button
                type="submit"
                disabled={verifyPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-70"
              >
                {verifyPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Verificar
              </button>
            </form>
            <button
              type="button"
              onClick={resend}
              disabled={resendPending}
              className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {resendPending ? "Enviando…" : "Reenviar código"}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <form action={emailFormAction} className="flex flex-col gap-2 border-t border-amber-200 px-3 py-3">
          <Input
            name="email"
            type="email"
            required
            defaultValue={email ?? ""}
            placeholder="seu-email@correto.com"
            className="h-8"
            aria-label="Novo e-mail"
          />
          <button
            type="submit"
            disabled={emailPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-70"
          >
            {emailPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar e reenviar código
          </button>
        </form>
      )}

      {(notice || state?.message || emailState?.message) && (
        <div
          className={cn(
            "border-t border-amber-200 px-3 py-2 text-xs",
            state?.message || (emailState && !emailState.ok) ? "text-rose-700" : "text-amber-700"
          )}
        >
          {state?.message ?? (emailState && !emailState.ok ? emailState.message : null) ?? notice}
        </div>
      )}
    </div>
  );
}
