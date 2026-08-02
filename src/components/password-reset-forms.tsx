"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

/** Passo 1: pede o e-mail e dispara o código (resposta sempre genérica). */
export function RequestResetForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, null);

  if (state?.ok) {
    return (
      <div className="w-full max-w-md rounded-3xl bg-theme-bg-paper p-6 md:p-8">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <MailCheck className="h-12 w-12 text-primary-500" />
          <h4 className="h4">Verifique seu e-mail</h4>
          <p className="body2 text-theme-text-secondary">
            Se houver uma conta com esse e-mail, enviamos um código de 6 dígitos para redefinir sua senha.
          </p>
          <Link className="mt-2 font-semibold text-primary-500 hover:underline" href="/redefinir-senha">
            Já tenho o código →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-3xl bg-theme-bg-paper p-6 md:p-8">
      <h4 className="h4">Recuperar senha</h4>
      <p className="mt-1 body2 text-theme-text-secondary">Informe seu e-mail e enviaremos um código para redefinir a senha.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <label className="block space-y-1 subtitle2">
          E-mail
          <input name="email" type="email" required autoComplete="email" className="form-control" />
        </label>
        {state?.message && (
          <p className="rounded-2xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.message}</p>
        )}
        <SubmitButton className="w-full">Enviar código</SubmitButton>
      </form>
      <p className="mt-4 text-center body2 text-theme-text-secondary">
        Lembrou a senha?{" "}
        <Link className="font-semibold text-primary-500" href="/login">Entrar</Link>
      </p>
    </div>
  );
}

/** Passo 2: e-mail + código + nova senha. */
export function ResetPasswordForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(resetPasswordAction, null);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/login"), 1600);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  if (state?.ok) {
    return (
      <div className="w-full max-w-md rounded-3xl bg-theme-bg-paper p-6 md:p-8">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          {/* Cor via style, não className: .h4 é uma regra fora de @layer (ver globals.css) e
              vence QUALQUER utilitário Tailwind de cor, então text-emerald-800 sozinho não
              apareceria — só style inline ganha de uma regra fora de layer. var(--success)
              (não um hex fixo) pra continuar legível se a página ganhar fundo escuro. */}
          <h4 className="h4" style={{ color: "var(--success)" }}>Senha redefinida!</h4>
          <p className="body2 text-theme-text-secondary">Redirecionando para o login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-3xl bg-theme-bg-paper p-6 md:p-8">
      <h4 className="h4">Redefinir senha</h4>
      <p className="mt-1 body2 text-theme-text-secondary">Cole o código que enviamos por e-mail e escolha uma nova senha.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <label className="block space-y-1 subtitle2">
          E-mail
          <input name="email" type="email" required defaultValue={defaultEmail} autoComplete="email" className="form-control" />
        </label>
        <label className="block space-y-1 subtitle2">
          Código (6 dígitos)
          <input name="code" inputMode="numeric" maxLength={6} required placeholder="000000" className="form-control tracking-[0.3em]" />
        </label>
        <label className="block space-y-1 subtitle2">
          Nova senha
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="form-control" />
        </label>
        {state?.message && (
          <p className="rounded-2xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.message}</p>
        )}
        <SubmitButton className="w-full">Redefinir senha</SubmitButton>
      </form>
      <p className="mt-4 text-center body2 text-theme-text-secondary">
        Não recebeu?{" "}
        <Link className="font-semibold text-primary-500" href="/recuperar-senha">Reenviar código</Link>
      </p>
    </div>
  );
}
