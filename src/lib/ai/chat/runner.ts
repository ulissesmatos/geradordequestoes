import type { Role } from "@prisma/client";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";
import { buildTurnMessages, maybeSummarizeSession } from "@/lib/ai/chat/context";
import { withRetry } from "@/lib/ai/chat/errors";
import { executeToolCall } from "@/lib/ai/chat/executors";
import { completeChat, type NeutralMessage } from "@/lib/ai/chat/provider";
import { getNeutralToolSpecs } from "@/lib/ai/chat/tools";

const MAX_TOOL_ITERATIONS = 3;

export type ToolTraceEntry = {
  name: string;
  arguments: string;
  result: string;
  durationMs: number;
};

export type ChatTurnEvent = { type: "tool_started"; name: string } | { type: "delta"; text: string };

export type ChatTurnResult = {
  message: string;
  model: string;
  questionSetId?: string;
  studyMaterialId?: string;
  toolTrace: ToolTraceEntry[];
};

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
  let questionSetId: string | undefined;
  let studyMaterialId: string | undefined;
  let lastFallbackMessage: string | undefined;
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
      input.onEvent?.({ type: "tool_started", name: call.name });

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
          argumentsJson: call.argumentsJson
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
      }

      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: resultForModel });
    }
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
    toolTrace
  };
}

export async function summarizeSessionIfNeeded(sessionId: string) {
  const settings = await getAiSettings();
  if (!settings.apiKey) return;
  await maybeSummarizeSession({ sessionId, settings });
}
