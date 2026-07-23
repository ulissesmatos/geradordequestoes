"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Mail, RefreshCw } from "lucide-react";
import {
  adminGenerateRandomPasswordAction,
  adminSendPasswordResetCodeAction,
  adminSetUserPasswordAction
} from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminPasswordTools({ userId, hasPassword }: { userId: string; hasPassword: boolean }) {
  const [manualPassword, setManualPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function runSet() {
    if (manualPassword.length < 8) {
      setFeedback({ tone: "error", text: "A senha precisa ter pelo menos 8 caracteres." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      formData.set("password", manualPassword);
      const result = await adminSetUserPasswordAction(formData);
      setFeedback({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) setManualPassword("");
    });
  }

  function runGenerate() {
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      const result = await adminGenerateRandomPasswordAction(formData);
      setGeneratedPassword(result.password ?? null);
      setFeedback({ tone: result.ok ? "success" : "error", text: result.message });
    });
  }

  function runSendReset() {
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      const result = await adminSendPasswordResetCodeAction(formData);
      setFeedback({ tone: result.ok ? "success" : "error", text: result.message });
    });
  }

  async function copyGenerated() {
    if (!generatedPassword) return;
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="admin-manual-password" className="block text-sm font-medium">
          Definir nova senha
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="admin-manual-password"
            type="text"
            value={manualPassword}
            onChange={(event) => setManualPassword(event.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="off"
          />
          <Button type="button" onClick={runSet} disabled={pending} className="shrink-0">
            <KeyRound className="h-4 w-4" />
            Definir
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={runGenerate} disabled={pending}>
          <RefreshCw className="h-4 w-4" />
          Gerar senha aleatória
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={runSendReset}
          disabled={pending || !hasPassword}
          title={!hasPassword ? "Este usuário ainda não tem senha cadastrada (login só via Google)." : undefined}
        >
          <Mail className="h-4 w-4" />
          Enviar código de redefinição por e-mail
        </Button>
      </div>

      {generatedPassword && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <code className="flex-1 text-sm font-semibold tracking-wide">{generatedPassword}</code>
          <Button type="button" size="sm" variant="outline" onClick={copyGenerated}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      )}

      {feedback && (
        <p className={feedback.tone === "success" ? "text-sm text-[var(--success)]" : "text-sm text-[var(--destructive)]"}>
          {feedback.text}
        </p>
      )}

      {!hasPassword && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Este usuário faz login só via Google (sem senha cadastrada). Definir ou gerar uma senha permite que ele também entre por e-mail e senha.
        </p>
      )}
    </div>
  );
}
