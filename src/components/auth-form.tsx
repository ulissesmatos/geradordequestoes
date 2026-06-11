"use client";

import Link from "next/link";
import { useActionState } from "react";
import { googleSignInAction, loginAction, registerAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState(action, null);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Entrar" : "Criar conta"}</CardTitle>
        <CardDescription>
          {mode === "login" ? "Acesse sua área de estudos." : "Comece a responder questões em poucos segundos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={googleSignInAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <GoogleIcon />
            Continuar com Google
          </button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          ou {mode === "login" ? "entre" : "cadastre-se"} com e-mail
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <form action={formAction} className="space-y-4">
          {mode === "register" && (
            <label className="block space-y-1 text-sm font-medium">
              Nome
              <Input name="name" required minLength={2} />
            </label>
          )}
          <label className="block space-y-1 text-sm font-medium">
            E-mail
            <Input name="email" type="email" required />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Senha
            <Input name="password" type="password" required minLength={mode === "register" ? 8 : 6} />
          </label>
          {mode === "login" && (
            <p className="text-right text-sm">
              <Link className="font-semibold text-[var(--primary)] hover:underline" href="/recuperar-senha">
                Esqueci minha senha
              </Link>
            </p>
          )}
          {state?.error && <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>}
          <SubmitButton className="w-full">{mode === "login" ? "Entrar" : "Cadastrar"}</SubmitButton>
          {mode === "register" && (
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              Ao criar conta, você concorda com os{" "}
              <Link className="font-semibold text-[var(--primary)] hover:underline" href="/termos">Termos de Uso</Link>{" "}
              e a{" "}
              <Link className="font-semibold text-[var(--primary)] hover:underline" href="/privacidade">Política de Privacidade</Link>.
            </p>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
          {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <Link className="font-semibold text-[var(--primary)]" href={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Cadastre-se" : "Entrar"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
