"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitContactAction, type ContactActionState } from "@/app/contato/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm({ defaultTeams = false }: { defaultTeams?: boolean }) {
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(submitContactAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold text-emerald-800">Mensagem enviada!</h2>
        <p className="text-sm text-emerald-700">
          Recebemos seu contato e responderemos no e-mail informado em breve.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          Nome
          <Input name="name" required minLength={2} placeholder="Seu nome" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          E-mail
          <Input name="email" type="email" required placeholder="voce@email.com" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          Telefone <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
          <Input name="phone" placeholder="(00) 00000-0000" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Assunto
          <Input name="subject" required minLength={2} placeholder="Sobre o que deseja falar?" />
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Mensagem
        <Textarea name="message" required minLength={10} rows={5} placeholder="Escreva sua mensagem..." />
      </label>

      <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm font-medium">
        <input type="checkbox" name="teams" defaultChecked={defaultTeams} className="h-4 w-4" />
        Tenho interesse no plano para empresas (assinatura em grupo)
      </label>

      {state?.error && (
        <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} size="lg">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar mensagem
      </Button>
    </form>
  );
}
