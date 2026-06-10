import { AiProvider } from "@prisma/client";
import { updateAiProviderSettingsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const defaultModels = {
  OPENAI: "gpt-4.1-mini",
  CLAUDE: "claude-sonnet-4-5",
  OPENROUTER: "openai/gpt-4.1-mini"
};

export default async function AiSettingsPage() {
  const stored = await prisma.aiProviderSetting.findUnique({ where: { id: "default" } });
  const apiKeyDecrypted = stored?.apiKey ? decryptSecret(stored.apiKey) : null;

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
      <div>
        <h1 className="text-3xl font-bold">Configuração de IA</h1>
        <p className="text-[var(--muted-foreground)]">
          Escolha o provedor usado por admins e alunos na geração de questões.
        </p>
      </div>

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

            <div className="space-y-2">
              <label className="space-y-1 text-sm font-medium">
                Chave da API
                <Input
                  name="apiKey"
                  type="password"
                  placeholder={apiKeyDecrypted ? "Cole uma nova chave para trocar, ou deixe em branco" : "Cole a chave do provedor"}
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-[var(--muted-foreground)]">
                {apiKeyDecrypted ? (
                  <>
                    ✓ Chave configurada. Deixe vazio para manter, ou cole uma nova para trocar. Para <strong>limpar</strong>,
                    selecione o campo, delete o conteúdo (se houver) e salve vazio.
                  </>
                ) : (
                  <>Cole sua chave de API. Será salva criptografada no banco de dados.</>
                )}
              </p>
            </div>

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
