import { AiChatRole, AiProvider, AiUsageEventStatus } from "@prisma/client";
import { Bot, CheckCircle2, User, Wrench, XCircle } from "lucide-react";
import { updateAiProviderSettingsAction } from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SecretInput } from "@/components/admin/secret-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { decryptSecret, maskSecret } from "@/lib/crypto";

const defaultModels = {
  OPENAI: "gpt-4.1-mini",
  CLAUDE: "claude-sonnet-4-5",
  OPENROUTER: "openai/gpt-4.1-mini"
};

const GENERATION_PAGE_SIZE = 30;
const ERRORS_PAGE_SIZE = 20;
/** Não existe coluna indexada "tem tool call" (fica dentro de metadata JSON) — não dá pra
 *  paginar 100% no banco. Busca essa janela de mensagens recentes e pagina o filtrado em
 *  memória; o total mostrado é "das últimas TOOLS_WINDOW mensagens", não o histórico inteiro. */
const TOOLS_WINDOW = 300;
const TOOLS_PAGE_SIZE = 10;
const GENERATION_STATUSES = ["SUCCESS", "USER_SUCCESS", "ERROR", "USER_ERROR"];

type ToolTraceEntry = { name: string; arguments: string; result: string; durationMs: number };

const TABS: AdminTabDef[] = [
  { value: "config", label: "Configuração" },
  { value: "generation", label: "Logs de geração" },
  { value: "tools", label: "Tool calls (chat)" },
  { value: "errors", label: "Erros de uso" }
];

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
}

function tryPretty(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default async function AdminAiHubPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; page?: string; status?: string; model?: string }>;
}) {
  const params = await searchParams;
  const activeTab =
    params.tab === "generation" || params.tab === "tools" || params.tab === "errors" ? params.tab : "config";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="IA" description="Provedor e limites de IA, e diagnóstico de uso, geração e ferramentas do chat." />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/ia" />

      {activeTab === "config" && <ConfigTab />}
      {activeTab === "tools" && <ToolCallsTab page={page} />}
      {activeTab === "errors" && <UsageErrorsTab page={page} />}
      {activeTab === "generation" && (
        <GenerationLogsTab page={page} statusFilter={params.status?.trim() || ""} modelFilter={params.model?.trim() || ""} />
      )}
    </div>
  );
}

async function ConfigTab() {
  const stored = await prisma.aiProviderSetting.findUnique({ where: { id: "default" } });
  const apiKeyDecrypted = stored?.apiKey ? decryptSecret(stored.apiKey) : null;
  const apiKeyMasked = maskSecret(stored?.apiKey ?? null);
  const webSearchMasked = maskSecret(stored?.webSearchApiKey ?? null);
  const webSearchEnabled = stored?.webSearchEnabled ?? false;

  const settings = stored ?? {
    provider: AiProvider.OPENAI,
    apiKey: null,
    model: defaultModels.OPENAI,
    baseUrl: null,
    siteUrl: null,
    appName: "Questões Certo/Errado"
  };
  const inputPriceValue = stored?.inputPricePerMillionUsd != null ? stored.inputPricePerMillionUsd.toString() : "";
  const outputPriceValue = stored?.outputPricePerMillionUsd != null ? stored.outputPricePerMillionUsd.toString() : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provedor de IA</CardTitle>
        <CardDescription>
          Escolha o provedor e insira a chave da API. A chave é criptografada no banco de dados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={stored?.updatedAt?.getTime() ?? "new"} action={updateAiProviderSettingsAction} className="grid gap-4">
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

          <div className="space-y-2 rounded-md border border-[var(--border)] p-4">
            <div>
              <p className="text-sm font-semibold">Preço do modelo (custo real nos logs)</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                USD por 1 milhão de tokens — confira na página de pricing do provedor. Sem histórico por modelo:{" "}
                <strong>atualize estes dois campos sempre que trocar de modelo acima</strong>, senão o custo calculado nos
                logs fica errado.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Entrada (US$/1M tokens)
                <Input
                  name="inputPricePerMillionUsd"
                  type="number"
                  step="0.0001"
                  min="0"
                  defaultValue={inputPriceValue}
                  placeholder="Ex.: 2.00"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Saída (US$/1M tokens)
                <Input
                  name="outputPricePerMillionUsd"
                  type="number"
                  step="0.0001"
                  min="0"
                  defaultValue={outputPriceValue}
                  placeholder="Ex.: 12.00"
                />
              </label>
            </div>
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

          {/* ── Busca na web (Tavily) ── */}
          <div className="space-y-3 rounded-md border border-[var(--border)] p-4">
            <div>
              <p className="text-sm font-semibold">Busca na web (Tavily)</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Permite que a IA busque informações atuais (editais, datas) via a tool <code>web_search</code> — funciona
                em qualquer provedor. Crie uma chave grátis em tavily.com.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="webSearchEnabled" defaultChecked={webSearchEnabled} className="h-4 w-4" />
              Ativar busca na web
            </label>
            <SecretInput
              name="webSearchApiKey"
              label="Tavily API key"
              masked={webSearchMasked}
              placeholder="tvly-..."
              help="Deixe em branco para manter a chave atual. Marque “Remover chave” para limpar."
            />
          </div>

          <SubmitButton>Salvar configuração</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

async function ToolCallsTab({ page }: { page: number }) {
  const chatMessages = await prisma.aiChatMessage.findMany({
    where: { role: AiChatRole.ASSISTANT },
    include: { session: { include: { user: { select: { email: true } } } } },
    orderBy: { createdAt: "desc" },
    take: TOOLS_WINDOW
  });

  // Busca o histórico completo das sessões envolvidas pra achar, de cada resposta com tool
  // call, a mensagem do USUÁRIO que a disparou — não dá pra saber isso só com a mensagem do
  // assistente (não existe FK "mensagem que originou esta resposta" no schema).
  const relevantSessionIds = [...new Set(chatMessages.map((msg) => msg.sessionId))];
  const sessionMessages = relevantSessionIds.length
    ? await prisma.aiChatMessage.findMany({
        where: { sessionId: { in: relevantSessionIds } },
        select: { id: true, sessionId: true, role: true, content: true },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const messagesBySession = new Map<string, typeof sessionMessages>();
  for (const message of sessionMessages) {
    const list = messagesBySession.get(message.sessionId);
    if (list) list.push(message);
    else messagesBySession.set(message.sessionId, [message]);
  }
  function findTriggeringUserMessage(assistantMsgId: string, sessionId: string): string | null {
    const list = messagesBySession.get(sessionId) ?? [];
    const idx = list.findIndex((m) => m.id === assistantMsgId);
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].role === AiChatRole.USER) return list[i].content;
    }
    return null;
  }

  const chatWithTools = chatMessages
    .map((msg) => {
      const meta = msg.metadata as { toolCalls?: ToolTraceEntry[] } | null;
      const toolCalls = meta?.toolCalls ?? [];
      return { msg, toolCalls, userMessage: findTriggeringUserMessage(msg.id, msg.sessionId) };
    })
    .filter((item) => item.toolCalls.length > 0);

  const totalPages = Math.max(1, Math.ceil(chatWithTools.length / TOOLS_PAGE_SIZE));
  const pageItems = chatWithTools.slice((page - 1) * TOOLS_PAGE_SIZE, page * TOOLS_PAGE_SIZE);

  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {chatWithTools.length} {chatWithTools.length === 1 ? "chamada" : "chamadas"} nas últimas {TOOLS_WINDOW} mensagens do
        assistente · página {page} de {totalPages}
      </p>
      {pageItems.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhuma mensagem com tool calls encontrada.</p>
      )}
      {pageItems.map(({ msg, toolCalls, userMessage }) => (
        <Card key={msg.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>{msg.session.user?.email ?? "usuário desconhecido"}</span>
              <span className="font-normal text-[var(--muted-foreground)]">{formatDateTimeBR(msg.createdAt)}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Sessão <code>{msg.sessionId}</code> · Msg <code>{msg.id}</code> · {toolCalls.length}{" "}
              {toolCalls.length === 1 ? "tool call" : "tool calls"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {userMessage ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  <User className="h-3 w-3" /> Usuário perguntou
                </p>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{userMessage}</p>
              </div>
            ) : (
              <p className="text-xs italic text-[var(--muted-foreground)]">
                Mensagem do usuário não encontrada (pode estar fora da janela de histórico consultada).
              </p>
            )}

            <div className="space-y-2">
              {toolCalls.map((call, i) => {
                let parsed: unknown;
                let isError = false;
                try {
                  parsed = JSON.parse(call.result);
                  isError = typeof parsed === "object" && parsed !== null && "error" in parsed;
                } catch {
                  parsed = call.result;
                }
                return (
                  <div
                    key={i}
                    className={`rounded-md border p-3 ${isError ? "border-[var(--danger-soft-border)] bg-[var(--danger-soft)]" : "border-[var(--border)] bg-[var(--surface-subtle)]"}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                        <Wrench className="h-3 w-3 text-[var(--muted-foreground)]" />
                        <code>{call.name}</code>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${isError ? "text-[var(--danger-soft-foreground)]" : "text-[var(--success)]"}`}
                      >
                        {isError ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {isError ? "ERRO" : "OK"} · {call.durationMs}ms
                      </span>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-[var(--muted-foreground)]">Argumentos</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--foreground)]">
                        {tryPretty(call.arguments)}
                      </pre>
                    </details>
                    <details open={isError} className="mt-1 text-xs">
                      <summary className="cursor-pointer text-[var(--muted-foreground)]">Resultado (raw)</summary>
                      <pre
                        className={`mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] ${isError ? "text-[var(--danger-soft-foreground)]" : "text-[var(--foreground)]"}`}
                      >
                        {tryPretty(call.result)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border border-[var(--border)] bg-[var(--primary-soft)] p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
                <Bot className="h-3 w-3" /> Resposta da IA
              </p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-[var(--primary-soft-foreground)]">{msg.content}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/ia?tab=tools&page=${p}`} />
    </section>
  );
}

async function UsageErrorsTab({ page }: { page: number }) {
  const [usageErrors, total] = await Promise.all([
    prisma.aiUsageEvent.findMany({
      where: { status: AiUsageEventStatus.ERROR },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ERRORS_PAGE_SIZE,
      take: ERRORS_PAGE_SIZE
    }),
    prisma.aiUsageEvent.count({ where: { status: AiUsageEventStatus.ERROR } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ERRORS_PAGE_SIZE));

  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {total} {total === 1 ? "erro registrado" : "erros registrados"} · página {page} de {totalPages}
      </p>
      {usageErrors.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum erro de uso registrado.</p>}
      {usageErrors.map((ev) => (
        <Card key={ev.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>{ev.user.email}</span>
              <span className="text-[var(--muted-foreground)]">{formatDateTimeBR(ev.createdAt)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              Tipo: <code>{ev.type}</code>
            </p>
            {ev.model && (
              <p>
                Modelo: <code>{ev.model}</code>
              </p>
            )}
            {ev.prompt && <p className="text-[var(--muted-foreground)] line-clamp-2 text-xs">Prompt: {ev.prompt}</p>}
            {ev.errorMessage && (
              <pre className="mt-2 rounded bg-[var(--danger-soft)] p-2 text-[10px] text-[var(--danger-soft-foreground)] whitespace-pre-wrap break-all">
                {ev.errorMessage}
              </pre>
            )}
          </CardContent>
        </Card>
      ))}
      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/ia?tab=errors&page=${p}`} />
    </section>
  );
}

async function GenerationLogsTab({
  page,
  statusFilter,
  modelFilter
}: {
  page: number;
  statusFilter: string;
  modelFilter: string;
}) {
  const generationWhere = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(modelFilter ? { model: modelFilter } : {})
  };

  const [generationLogs, generationTotal, generationModelRows] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      where: generationWhere,
      include: { user: { select: { email: true } }, subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * GENERATION_PAGE_SIZE,
      take: GENERATION_PAGE_SIZE
    }),
    prisma.aiGenerationLog.count({ where: generationWhere }),
    prisma.aiGenerationLog.findMany({ distinct: ["model"], select: { model: true }, orderBy: { model: "asc" } })
  ]);
  const generationTotalPages = Math.max(1, Math.ceil(generationTotal / GENERATION_PAGE_SIZE));
  const generationModels = generationModelRows.map((row) => row.model);

  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams({
      tab: "generation",
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(modelFilter ? { model: modelFilter } : {}),
      page: String(targetPage)
    });
    return `/admin/ia?${query.toString()}`;
  };

  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {generationTotal} {generationTotal === 1 ? "registro" : "registros"} · página {page} de {generationTotalPages}
      </p>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="generation" />
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
          Status
          <Select name="status" defaultValue={statusFilter} className="h-9">
            <option value="">Todos</option>
            {GENERATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
          Modelo
          <Select name="model" defaultValue={modelFilter} className="h-9">
            <option value="">Todos</option>
            {generationModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton variant="outline" size="sm">
          Filtrar
        </SubmitButton>
      </form>

      {generationLogs.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhum log de geração encontrado com esses filtros.</p>
      )}
      {generationLogs.map((log) => {
        const isError = log.status === "ERROR" || log.status === "USER_ERROR";
        return (
          <Card key={log.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span className={`font-semibold ${isError ? "text-[var(--destructive)]" : "text-[var(--success)]"}`}>{log.status}</span>
                <span className="text-[var(--muted-foreground)]">{formatDateTimeBR(log.createdAt)}</span>
              </CardTitle>
              <CardDescription>
                {log.subject.name} / {log.topic.name} / {log.difficulty} / {log.quantity} questões
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-[var(--muted-foreground)]">
                Gerado por: {log.user.email} · Modelo: <code>{log.model}</code>
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {log.inputTokens != null && log.outputTokens != null
                  ? `${log.inputTokens} in / ${log.outputTokens} out`
                  : "tokens não medidos"}{" "}
                · {log.costUsd != null ? formatUsd(log.costUsd.toNumber()) : "custo não medido"}
              </p>
              {log.userPrompt && (
                <p className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-xs">
                  <strong>Pedido do usuário:</strong> {log.userPrompt}
                </p>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--muted-foreground)]">Prompt completo enviado à IA</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--foreground)]">
                  {log.prompt}
                </pre>
              </details>
              {log.responseText && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--muted-foreground)]">Resposta da IA</summary>
                  <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--foreground)]">
                    {tryPretty(log.responseText)}
                  </pre>
                </details>
              )}
              {log.errorMessage && (
                <pre className="mt-2 rounded bg-[var(--danger-soft)] p-2 text-[10px] text-[var(--danger-soft-foreground)] whitespace-pre-wrap break-all">
                  {log.errorMessage}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}

      <AdminPagination page={page} totalPages={generationTotalPages} buildHref={pageHref} />
    </section>
  );
}
