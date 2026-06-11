import { AiChatRole, AiUsageEventStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function AiLogsPage() {
  const [generationLogs, usageErrors, chatMessages] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      include: { admin: true, subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.aiUsageEvent.findMany({
      where: { status: AiUsageEventStatus.ERROR },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.aiChatMessage.findMany({
      where: { role: AiChatRole.ASSISTANT },
      include: { session: { include: { user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 60
    })
  ]);

  // Filter messages that have tool calls in metadata
  type ToolTraceEntry = { name: string; arguments: string; result: string; durationMs: number };
  const chatWithTools = chatMessages
    .map((msg) => {
      const meta = msg.metadata as { toolCalls?: ToolTraceEntry[] } | null;
      const toolCalls = meta?.toolCalls ?? [];
      return { msg, toolCalls };
    })
    .filter((item) => item.toolCalls.length > 0);

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Logs de IA" description="Diagnóstico em tempo real de erros de tools, geração e uso." />

      {/* ── Chat: Tool Traces ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tool Calls recentes (chat)</h2>
        {chatWithTools.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhuma mensagem com tool calls encontrada.</p>
        )}
        {chatWithTools.map(({ msg, toolCalls }) => (
          <Card key={msg.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>{msg.session.user?.email ?? "usuário desconhecido"}</span>
                <span className="text-[var(--muted-foreground)]">{msg.createdAt.toLocaleString("pt-BR")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-[var(--muted-foreground)] text-xs">
                Sessão: <code>{msg.sessionId}</code> · Msg: <code>{msg.id}</code>
              </p>
              <p className="text-[var(--muted-foreground)] line-clamp-2 text-xs italic">
                Resposta final: {msg.content.slice(0, 200)}
              </p>
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
                      <code className="text-xs font-bold">{call.name}</code>
                      <span className={`text-xs font-semibold ${isError ? "text-[var(--danger-soft-foreground)]" : "text-[var(--success)]"}`}>
                        {isError ? "❌ ERRO" : "✓ OK"} · {call.durationMs}ms
                      </span>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-[var(--muted-foreground)]">Argumentos</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-[var(--foreground)]">
                        {tryPretty(call.arguments)}
                      </pre>
                    </details>
                    <details open={isError} className="mt-1 text-xs">
                      <summary className="cursor-pointer text-[var(--muted-foreground)]">Resultado (raw)</summary>
                      <pre className={`mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] ${isError ? "text-[var(--danger-soft-foreground)]" : "text-[var(--foreground)]"}`}>
                        {tryPretty(call.result)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* ── Erros de Usage ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Erros de uso (AiUsageEvent)</h2>
        {usageErrors.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhum erro de uso registrado.</p>
        )}
        {usageErrors.map((ev) => (
          <Card key={ev.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>{ev.user.email}</span>
                <span className="text-[var(--muted-foreground)]">{ev.createdAt.toLocaleString("pt-BR")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Tipo: <code>{ev.type}</code></p>
              {ev.model && <p>Modelo: <code>{ev.model}</code></p>}
              {ev.prompt && <p className="text-[var(--muted-foreground)] line-clamp-2 text-xs">Prompt: {ev.prompt}</p>}
              {ev.errorMessage && (
                <pre className="mt-2 rounded bg-[var(--danger-soft)] p-2 text-[10px] text-[var(--danger-soft-foreground)] whitespace-pre-wrap break-all">
                  {ev.errorMessage}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* ── Logs de Geração (admin) ───────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Logs de geração (admin)</h2>
        {generationLogs.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhum log de geração encontrado.</p>
        )}
        {generationLogs.map((log) => (
          <Card key={log.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span className={`font-semibold ${log.status === "ERROR" ? "text-[var(--destructive)]" : "text-[var(--success)]"}`}>
                  {log.status}
                </span>
                <span className="text-[var(--muted-foreground)]">{log.createdAt.toLocaleString("pt-BR")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{log.subject.name} / {log.topic.name} / {log.difficulty} / {log.quantity} questões</p>
              <p className="text-[var(--muted-foreground)]">Admin: {log.admin.email} · Modelo: {log.model}</p>
              {log.errorMessage && (
                <pre className="mt-2 rounded bg-[var(--danger-soft)] p-2 text-[10px] text-[var(--danger-soft-foreground)] whitespace-pre-wrap break-all">
                  {log.errorMessage}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function tryPretty(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
