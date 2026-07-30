import type { Role } from "@prisma/client";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";
import { buildTurnMessages, maybeSummarizeSession } from "@/lib/ai/chat/context";
import { withRetry } from "@/lib/ai/chat/errors";
import { executeToolCall } from "@/lib/ai/chat/executors";
import { describeToolStart } from "@/lib/ai/chat/progress";
import { completeChat, streamChat, type CompletionResult, type NeutralMessage } from "@/lib/ai/chat/provider";
import { chatTools, getNeutralToolSpecs } from "@/lib/ai/chat/tools";

const MAX_TOOL_ITERATIONS = 3;

export type ToolTraceEntry = {
  name: string;
  arguments: string;
  result: string;
  durationMs: number;
};

export type ChatTurnEvent =
  /** `label` e a frase pronta mostrada ao usuario, montada a partir dos argumentos REAIS da ferramenta. */
  | { type: "tool_started"; name: string; label: string }
  | { type: "delta"; text: string }
  /**
   * O texto transmitido nesta rodada era só o modelo narrando a intenção ANTES de chamar a
   * ferramenta ("Beleza! Gere mais um bloco com 10 questões…") — não é a resposta final.
   * O cliente precisa descartar o que já mostrou, senão essa narração fica colada na resposta
   * de verdade. Como só `finalText` é salvo, sem isso a tela ao vivo diverge do histórico.
   */
  | { type: "draft_discarded" };

export type ChatSource = { title: string; url: string };

export type ChatClarification = {
  question: string;
  options: { label: string; description?: string }[];
  allowFreeText: boolean;
};

export type ChatTurnResult = {
  message: string;
  model: string;
  questionSetId?: string;
  studyMaterialId?: string;
  toolTrace: ToolTraceEntry[];
  sources?: ChatSource[];
  clarification?: ChatClarification;
};

/**
 * Se a chamada for ask_clarifying_question, extrai a pergunta/opções e sinaliza
 * para o loop encerrar o turno imediatamente (sem chamar o modelo de novo) —
 * a resposta do usuário aos botões vira a próxima mensagem normal do chat.
 */
function tryParseClarification(call: { name: string; argumentsJson: string }): ChatClarification | null {
  if (call.name !== "ask_clarifying_question") return null;
  try {
    const args = chatTools.ask_clarifying_question.schema.parse(JSON.parse(call.argumentsJson));
    return { question: args.question, options: args.options, allowFreeText: args.allowFreeText ?? true };
  } catch {
    return null;
  }
}

/** Acumula fontes únicas (por URL), limitando a 6. */
function pushSources(into: ChatSource[], from?: ChatSource[]) {
  if (!from?.length) return;
  for (const source of from) {
    if (into.length >= 6) break;
    if (!into.some((existing) => existing.url === source.url)) into.push(source);
  }
}

export async function runChatTurn(input: {
  user: { id: string; role: Role };
  sessionId: string;
  prompt: string;
  /** Reservado para streaming futuro via route handler; ignorado por enquanto. */
  onEvent?: (event: ChatTurnEvent) => void;
}): Promise<ChatTurnResult> {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(settings.provider)} no painel admin.`);
  }

  const messages: NeutralMessage[] = await buildTurnMessages({
    sessionId: input.sessionId,
    userId: input.user.id
  });
  const tools = getNeutralToolSpecs();

  const toolTrace: ToolTraceEntry[] = [];
  const collectedSources: ChatSource[] = [];
  let questionSetId: string | undefined;
  let studyMaterialId: string | undefined;
  let lastFallbackMessage: string | undefined;
  let clarification: ChatClarification | undefined;
  let generationCount = 0;
  let materialCount = 0;
  let finalText = "";

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const exhausted = iteration === MAX_TOOL_ITERATIONS;
    if (exhausted) {
      messages.push({
        role: "system",
        content: "Limite de ferramentas do turno atingido. Responda agora ao usuário com o que você já tem; não chame mais ferramentas."
      });
    }

    const result = await withRetry(() =>
      completeChat({
        settings,
        messages,
        tools: exhausted ? [] : tools,
        maxOutputTokens: 900
      })
    );

    if (result.kind === "text") {
      finalText = result.text;
      break;
    }

    messages.push({ role: "assistant", content: result.assistantText, toolCalls: result.calls });

    for (const call of result.calls) {
      input.onEvent?.({ type: "tool_started", name: call.name, label: describeToolStart(call.name, call.argumentsJson) });

      const parsedClarification = tryParseClarification(call);
      if (parsedClarification) {
        clarification = parsedClarification;
        finalText = parsedClarification.question;
        toolTrace.push({ name: call.name, arguments: call.argumentsJson.slice(0, 2000), result: "(pergunta exibida ao usuário)", durationMs: 0 });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify({ ok: true, note: "Pergunta enviada ao usuário; aguardando resposta." }) });
        continue;
      }

      const isGeneration = call.name === "generate_questions" || call.name === "generate_review_from_mistakes";
      const isMaterial = call.name === "generate_study_material";
      let resultForModel: string;

      if (isGeneration && generationCount >= 1) {
        resultForModel = JSON.stringify({ error: "Já foi gerado um bloco de questões neste turno. Peça ao usuário para enviar uma nova mensagem se quiser outro bloco." });
      } else if (isMaterial && materialCount >= 1) {
        resultForModel = JSON.stringify({ error: "Já foi gerado um material neste turno. Peça ao usuário para enviar uma nova mensagem se quiser outro material." });
      } else {
        const started = Date.now();
        const execution = await executeToolCall({
          user: input.user,
          sessionId: input.sessionId,
          userPrompt: input.prompt,
          name: call.name,
          argumentsJson: call.argumentsJson,
          // Reaproveita o canal de tool_started: a tela só troca a frase exibida.
          onProgress: (label) => input.onEvent?.({ type: "tool_started", name: call.name, label })
        });
        toolTrace.push({
          name: call.name,
          arguments: call.argumentsJson.slice(0, 2000),
          result: execution.resultForModel.slice(0, 2000),
          durationMs: Date.now() - started
        });
        resultForModel = execution.resultForModel;
        if (execution.questionSetId) {
          questionSetId = execution.questionSetId;
          if (isGeneration) generationCount += 1;
        }
        if (execution.studyMaterialId) {
          studyMaterialId = execution.studyMaterialId;
          materialCount += 1;
        }
        if (execution.fallbackMessage) lastFallbackMessage = execution.fallbackMessage;
        pushSources(collectedSources, execution.sources);
      }

      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: resultForModel });
    }

    if (clarification) break;
  }

  if (!finalText.trim()) {
    if (!lastFallbackMessage) {
      throw new Error("A IA não retornou uma resposta. Tente reenviar a mensagem.");
    }
    finalText = lastFallbackMessage;
  }

  return {
    message: finalText,
    model: settings.model,
    questionSetId,
    studyMaterialId,
    toolTrace,
    sources: collectedSources.length ? collectedSources : undefined,
    clarification
  };
}

export async function streamChatTurn(input: {
  user: { id: string; role: Role };
  sessionId: string;
  prompt: string;
  onEvent: (event: ChatTurnEvent) => void;
}): Promise<ChatTurnResult> {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(settings.provider)} no painel admin.`);
  }

  const messages: NeutralMessage[] = await buildTurnMessages({
    sessionId: input.sessionId,
    userId: input.user.id
  });
  const tools = getNeutralToolSpecs();

  const toolTrace: ToolTraceEntry[] = [];
  const collectedSources: ChatSource[] = [];
  let questionSetId: string | undefined;
  let studyMaterialId: string | undefined;
  let lastFallbackMessage: string | undefined;
  let clarification: ChatClarification | undefined;
  let generationCount = 0;
  let materialCount = 0;
  let finalText = "";

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const exhausted = iteration === MAX_TOOL_ITERATIONS;
    if (exhausted) {
      messages.push({
        role: "system",
        content: "Limite de ferramentas do turno atingido. Responda agora ao usuário com o que você já tem; não chame mais ferramentas."
      });
    }

    let completion: CompletionResult | null = null;
    // Só sabemos se a rodada é "resposta final" ou "chamada de ferramenta" quando ela termina,
    // mas os tokens precisam ir para a tela na hora para manter a sensação de streaming. Então
    // transmitimos e, se no fim virar chamada de ferramenta, mandamos o cliente descartar.
    let streamedDraft = false;
    for await (const event of streamChat({ settings, messages, tools: exhausted ? [] : tools, maxOutputTokens: 900 })) {
      if (event.type === "delta") {
        streamedDraft = true;
        input.onEvent({ type: "delta", text: event.text });
      } else {
        completion = event.result;
      }
    }
    if (!completion) throw new Error("A IA não retornou uma resposta. Tente reenviar a mensagem.");

    if (completion.kind === "text") {
      finalText = completion.text;
      break;
    }

    // Rodada de ferramenta: o que foi transmitido era narração de intenção, não resposta.
    if (streamedDraft) input.onEvent({ type: "draft_discarded" });

    messages.push({ role: "assistant", content: completion.assistantText, toolCalls: completion.calls });

    for (const call of completion.calls) {
      input.onEvent({ type: "tool_started", name: call.name, label: describeToolStart(call.name, call.argumentsJson) });

      const parsedClarification = tryParseClarification(call);
      if (parsedClarification) {
        clarification = parsedClarification;
        finalText = parsedClarification.question;
        // A pergunta é sintética (não veio token a token do modelo): emite como delta pra aparecer na hora.
        input.onEvent({ type: "delta", text: parsedClarification.question });
        toolTrace.push({ name: call.name, arguments: call.argumentsJson.slice(0, 2000), result: "(pergunta exibida ao usuário)", durationMs: 0 });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify({ ok: true, note: "Pergunta enviada ao usuário; aguardando resposta." }) });
        continue;
      }

      const isGeneration = call.name === "generate_questions" || call.name === "generate_review_from_mistakes";
      const isMaterial = call.name === "generate_study_material";
      let resultForModel: string;

      if (isGeneration && generationCount >= 1) {
        resultForModel = JSON.stringify({ error: "Já foi gerado um bloco de questões neste turno. Peça ao usuário para enviar uma nova mensagem se quiser outro bloco." });
      } else if (isMaterial && materialCount >= 1) {
        resultForModel = JSON.stringify({ error: "Já foi gerado um material neste turno. Peça ao usuário para enviar uma nova mensagem se quiser outro material." });
      } else {
        const started = Date.now();
        const execution = await executeToolCall({
          user: input.user,
          sessionId: input.sessionId,
          userPrompt: input.prompt,
          name: call.name,
          argumentsJson: call.argumentsJson,
          // Reaproveita o canal de tool_started: a tela só troca a frase exibida.
          onProgress: (label) => input.onEvent?.({ type: "tool_started", name: call.name, label })
        });
        toolTrace.push({
          name: call.name,
          arguments: call.argumentsJson.slice(0, 2000),
          result: execution.resultForModel.slice(0, 2000),
          durationMs: Date.now() - started
        });
        resultForModel = execution.resultForModel;
        if (execution.questionSetId) {
          questionSetId = execution.questionSetId;
          if (isGeneration) generationCount += 1;
        }
        if (execution.studyMaterialId) {
          studyMaterialId = execution.studyMaterialId;
          materialCount += 1;
        }
        if (execution.fallbackMessage) lastFallbackMessage = execution.fallbackMessage;
        pushSources(collectedSources, execution.sources);
      }

      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: resultForModel });
    }

    if (clarification) break;
  }

  if (!finalText.trim()) {
    if (!lastFallbackMessage) {
      throw new Error("A IA não retornou uma resposta. Tente reenviar a mensagem.");
    }
    finalText = lastFallbackMessage;
    // O modelo não redigiu texto (só gerou): emite a confirmação determinística como delta.
    input.onEvent({ type: "delta", text: finalText });
  }

  return {
    message: finalText,
    model: settings.model,
    questionSetId,
    studyMaterialId,
    toolTrace,
    sources: collectedSources.length ? collectedSources : undefined,
    clarification
  };
}

export async function summarizeSessionIfNeeded(sessionId: string) {
  const settings = await getAiSettings();
  if (!settings.apiKey) return;
  await maybeSummarizeSession({ sessionId, settings });
}
