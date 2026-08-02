"use client";

import Link from "next/link";
import { useActionState } from "react";
import { googleSignInAction, loginAction, registerAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState(action, null);

  return (
    <div className="w-full max-w-md rounded-3xl bg-theme-bg-paper p-6 md:p-8">
      <h4 className="h4">{mode === "login" ? "Entrar" : "Criar conta"}</h4>
      <p className="mt-1 body2 text-theme-text-secondary">
        {mode === "login" ? "Acesse sua área de estudos." : "Comece a responder questões em poucos segundos."}
      </p>

      <form action={googleSignInAction} className="mt-6">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-theme-divider bg-theme-bg-paper px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-theme-bg-default"
        >
          <GoogleIcon />
          Continuar com Google
        </button>
      </form>
      {/* O botão do Google fica fora do formulário de cadastro, então quem entra por aqui
          não veria referência a Termos/Privacidade em nenhum momento. */}
      {mode === "register" && (
        <p className="mt-2 text-center caption2 text-theme-text-secondary">
          Ao continuar com o Google, você concorda com os{" "}
          <Link className="font-semibold text-primary-500 hover:underline" href="/termos" target="_blank">Termos de Uso</Link>{" "}
          e a{" "}
          <Link className="font-semibold text-primary-500 hover:underline" href="/privacidade" target="_blank">Política de Privacidade</Link>.
        </p>
      )}
      <div className="my-4 flex items-center gap-3 caption2 text-theme-text-secondary">
        <span className="h-px flex-1 bg-theme-divider" />
        ou {mode === "login" ? "entre" : "cadastre-se"} com e-mail
        <span className="h-px flex-1 bg-theme-divider" />
      </div>
      <form action={formAction} className="space-y-4">
        {mode === "register" && (
          <label className="block space-y-1 subtitle2">
            Nome
            <input name="name" required minLength={2} className="form-control" />
          </label>
        )}
        <label className="block space-y-1 subtitle2">
          E-mail
          <input name="email" type="email" required className="form-control" />
        </label>
        <label className="block space-y-1 subtitle2">
          Senha
          <input name="password" type="password" required minLength={mode === "register" ? 8 : 6} className="form-control" />
        </label>
        {mode === "login" && (
          <p className="text-right text-sm">
            <Link className="font-semibold text-primary-500 hover:underline" href="/recuperar-senha">
              Esqueci minha senha
            </Link>
          </p>
        )}
        {/* Checkbox obrigatório (era apenas texto informativo). O aceite é gravado com
            data/hora no usuário — é o que serve de prova de consentimento numa disputa. */}
        {mode === "register" && (
          <label className="flex items-start gap-2 caption2 text-theme-text-secondary">
            <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 shrink-0 accent-primary-500" />
            <span>
              Li e concordo com os{" "}
              <Link className="font-semibold text-primary-500 hover:underline" href="/termos" target="_blank">Termos de Uso</Link>{" "}
              e a{" "}
              <Link className="font-semibold text-primary-500 hover:underline" href="/privacidade" target="_blank">Política de Privacidade</Link>.
            </span>
          </label>
        )}
        {state?.error && <p className="rounded-2xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>}
        <SubmitButton className="w-full">{mode === "login" ? "Entrar" : "Cadastrar"}</SubmitButton>
      </form>
      <p className="mt-4 text-center body2 text-theme-text-secondary">
        {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
        <Link className="font-semibold text-primary-500" href={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "Cadastre-se" : "Entrar"}
        </Link>
      </p>
    </div>
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
