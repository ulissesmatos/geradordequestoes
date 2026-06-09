"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions";
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
          {state?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          <SubmitButton className="w-full">{mode === "login" ? "Entrar" : "Cadastrar"}</SubmitButton>
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
