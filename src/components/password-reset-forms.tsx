"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Passo 1: pede o e-mail e dispara o código (resposta sempre genérica). */
export function RequestResetForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, null);

  if (state?.ok) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MailCheck className="h-12 w-12 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Verifique seu e-mail</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Se houver uma conta com esse e-mail, enviamos um código de 6 dígitos para redefinir sua senha.
          </p>
          <Link className="mt-2 font-semibold text-[var(--primary)] hover:underline" href="/redefinir-senha">
            Já tenho o código →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Informe seu e-mail e enviaremos um código para redefinir a senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            E-mail
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          {state?.message && (
            <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.message}</p>
          )}
          <SubmitButton className="w-full">Enviar código</SubmitButton>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
          Lembrou a senha?{" "}
          <Link className="font-semibold text-[var(--primary)]" href="/login">Entrar</Link>
        </p>
      </CardContent>
    </Card>
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
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h2 className="text-lg font-semibold text-emerald-800">Senha redefinida!</h2>
          <p className="text-sm text-[var(--muted-foreground)]">Redirecionando para o login…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>Cole o código que enviamos por e-mail e escolha uma nova senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            E-mail
            <Input name="email" type="email" required defaultValue={defaultEmail} autoComplete="email" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Código (6 dígitos)
            <Input name="code" inputMode="numeric" maxLength={6} required placeholder="000000" className="tracking-[0.3em]" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Nova senha
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          {state?.message && (
            <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.message}</p>
          )}
          <SubmitButton className="w-full">Redefinir senha</SubmitButton>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
          Não recebeu?{" "}
          <Link className="font-semibold text-[var(--primary)]" href="/recuperar-senha">Reenviar código</Link>
        </p>
      </CardContent>
    </Card>
  );
}
