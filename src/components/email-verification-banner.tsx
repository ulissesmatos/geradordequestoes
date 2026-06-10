"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MailWarning, X } from "lucide-react";
import { requestEmailCodeAction, verifyEmailCodeAction } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function EmailVerificationBanner({ email }: { email: string | null }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [resendPending, startResend] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, verifyPending] = useActionState(verifyEmailCodeAction, null);

  useEffect(() => {
    if (state?.ok) {
      setNotice("E-mail verificado com sucesso!");
      const t = setTimeout(() => router.refresh(), 900);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  function resend() {
    setNotice(null);
    startResend(async () => {
      const result = await requestEmailCodeAction();
      setNotice(result.message ?? (result.ok ? "Código reenviado. Confira seu e-mail." : null));
      if (result.ok) setOpen(true);
    });
  }

  if (dismissed || state?.ok) {
    if (state?.ok) {
      return (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-800">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          {notice ?? "E-mail verificado!"}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Confirme seu e-mail{email ? <> <strong>{email}</strong></> : null} para proteger sua conta.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!open ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                if (!notice) resend();
              }}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Confirmar agora
            </button>
          ) : (
            <form action={formAction} className="flex items-center gap-2">
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="h-8 w-28 text-center tracking-[0.3em]"
                aria-label="Código de verificação"
              />
              <button
                type="submit"
                disabled={verifyPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-70"
              >
                {verifyPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Verificar
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={resendPending}
                className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline disabled:opacity-60"
              >
                {resendPending ? "Enviando…" : "Reenviar"}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dispensar"
            className="rounded-md p-1 text-amber-700 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {(notice || state?.message) && (
        <div className={cn("px-4 pb-2 text-center text-xs sm:text-left", state?.message ? "text-rose-700" : "text-amber-700")}>
          {state?.message ?? notice}
        </div>
      )}
    </div>
  );
}
