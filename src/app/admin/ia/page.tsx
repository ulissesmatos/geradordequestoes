import { AiProvider } from "@prisma/client";
import { updateAiProviderSettingsAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SecretInput } from "@/components/admin/secret-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { decryptSecret, maskSecret } from "@/lib/crypto";

const defaultModels = {
  OPENAI: "gpt-4.1-mini",
  CLAUDE: "claude-sonnet-4-5",
  OPENROUTER: "openai/gpt-4.1-mini"
};

export default async function AiSettingsPage() {
  const stored = await prisma.aiProviderSetting.findUnique({ where: { id: "default" } });
  const apiKeyDecrypted = stored?.apiKey ? decryptSecret(stored.apiKey) : null;
  const apiKeyMasked = maskSecret(stored?.apiKey ?? null);

  const settings = stored ?? {
    provider: AiProvider.OPENAI,
    apiKey: null,
    model: defaultModels.OPENAI,
    baseUrl: null,
    siteUrl: null,
    appName: "Questões Certo/Errado"
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Configuração de IA"
        description="Escolha o provedor usado por admins e alunos na geração de questões."
      />

      <Card>
        <CardHeader>
          <CardTitle>Provedor de IA</CardTitle>
          <CardDescription>
            Escolha o provedor e insira a chave da API. A chave é criptografada no banco de dados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAiProviderSettingsAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Provedor
                <Select name="provider" defaultValue={settings.provider}>
                  <option value="OPENAI">OpenAI (gpt-4.1-mini)</option>
                  <option value="CLAUDE">Claude / Anthropic (sonnet-4.5)</option>
                  <option value="OPENROUTER">OpenRouter (suporta múltiplos modelos)</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Modelo
                <Input
                  name="model"
                  defaultValue={settings.model}
                  list="ai-model-presets"
                  required
                  placeholder="Ex.: gpt-4.1-mini, claude-sonnet-4-5"
                />
              </label>
            </div>

            <SecretInput
              name="apiKey"
              label="Chave da API"
              masked={apiKeyMasked}
              placeholder="Cole a chave do provedor"
              help="Será salva criptografada no banco. Marque “Remover chave” para usar o fallback do ambiente."
            />

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm font-medium">
                Base URL (opcional)
                <Input
                  name="baseUrl"
                  defaultValue={settings.baseUrl ?? ""}
                  placeholder="https://api.openai.com/v1 (padrão)"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Deixe vazio para usar o endpoint padrão do provedor. <strong>Não coloque o URL do seu site aqui.</strong>
                </p>
              </label>
              <label className="space-y-1 text-sm font-medium">
                HTTP-Referer (OpenRouter)
                <Input name="siteUrl" defaultValue={settings.siteUrl ?? ""} placeholder="https://seu-site.com" />
                <p className="text-xs text-[var(--muted-foreground)]">URL do seu site (para identificação no OpenRouter).</p>
              </label>
              <label className="space-y-1 text-sm font-medium">
                X-Title (OpenRouter)
                <Input name="appName" defaultValue={settings.appName ?? ""} placeholder="Seu app" />
              </label>
            </div>

            <datalist id="ai-model-presets">
              <option value={defaultModels.OPENAI} />
              <option value="gpt-4o-mini" />
              <option value={defaultModels.CLAUDE} />
              <option value="claude-opus-4-8" />
              <option value={defaultModels.OPENROUTER} />
              <option value="anthropic/claude-sonnet-4.5" />
              <option value="google/gemini-2.5-flash" />
            </datalist>

            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm">
              <div className="space-y-1 text-[var(--foreground)]">
                <strong>Status:</strong>
                <div className="text-[var(--muted-foreground)]">
                  Provedor: <code className="font-semibold text-[var(--foreground)]">{settings.provider}</code>
                  <br />
                  Modelo: <code className="font-semibold text-[var(--foreground)]">{settings.model}</code>
                  <br />
                  Chave: {apiKeyDecrypted ? <span className="font-semibold text-[var(--success)]">✓ Configurada</span> : <span className="font-semibold text-[var(--warning)]">⚠ Não configurada (fallback env)</span>}
                </div>
              </div>
            </div>

            <SubmitButton>Salvar configuração</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
