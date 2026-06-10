import { AiChatPresetUsageLevel, AiProvider } from "@prisma/client";
import { updateAiProviderSettingsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/prisma";

const defaultModels = {
  OPENAI: "gpt-4.1-mini",
  CLAUDE: "claude-sonnet-4-5",
  OPENROUTER: "openai/gpt-4.1-mini"
};

export default async function AiSettingsPage() {
  const settings =
    (await prisma.aiProviderSetting.findUnique({ where: { id: "default" } })) ??
    ({
      provider: AiProvider.OPENAI,
      apiKey: null,
      model: defaultModels.OPENAI,
      baseUrl: null,
      siteUrl: null,
      appName: "Questões Certo/Errado",
      chatPresetUsageLevel: AiChatPresetUsageLevel.MEDIO
    } as const);

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
          <CardTitle>Provedor ativo</CardTitle>
          <CardDescription>
            A chave fica salva no servidor. Deixe o campo de chave em branco para manter a chave atual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAiProviderSettingsAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Provedor
                <Select name="provider" defaultValue={settings.provider}>
                  <option value="OPENAI">OpenAI</option>
                  <option value="CLAUDE">Claude / Anthropic</option>
                  <option value="OPENROUTER">OpenRouter</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Modelo
                <Input
                  name="model"
                  defaultValue={settings.model}
                  list="ai-model-presets"
                  required
                  placeholder="Ex.: gpt-4.1-mini, claude-sonnet-4-5, openai/gpt-4.1-mini"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium">
              Chave da API
              <Input
                name="apiKey"
                type="password"
                placeholder={settings.apiKey ? "Chave atual salva. Digite outra para trocar." : "Cole a chave do provedor escolhido"}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm font-medium">
                Base URL opcional
                <Input
                  name="baseUrl"
                  defaultValue={settings.baseUrl ?? ""}
                  placeholder="Use só se quiser sobrescrever o endpoint padrão"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Site URL
                <Input name="siteUrl" defaultValue={settings.siteUrl ?? ""} placeholder="OpenRouter: HTTP-Referer" />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Nome do app
                <Input name="appName" defaultValue={settings.appName ?? "Questões Certo/Errado"} placeholder="OpenRouter: X-Title" />
              </label>
            </div>

            <datalist id="ai-model-presets">
              <option value={defaultModels.OPENAI} />
              <option value="gpt-4.1" />
              <option value="gpt-4o-mini" />
              <option value={defaultModels.CLAUDE} />
              <option value="claude-opus-4-1" />
              <option value={defaultModels.OPENROUTER} />
              <option value="anthropic/claude-sonnet-4.5" />
              <option value="google/gemini-2.5-flash" />
            </datalist>

            <div className="rounded-md bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
              Provedor atual: <strong>{settings.provider}</strong>. Chave:{" "}
              <strong>{settings.apiKey ? "configurada" : "não configurada"}</strong>.
            </div>

            <SubmitButton>Salvar configuração</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
