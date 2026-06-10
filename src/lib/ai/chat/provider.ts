import { AiProvider } from "@prisma/client";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getAiSettings } from "@/lib/ai/settings";
import { AiProviderError } from "@/lib/ai/chat/errors";
import type { NeutralToolSpec } from "@/lib/ai/chat/tools";

export type AiSettings = Awaited<ReturnType<typeof getAiSettings>>;

export type NeutralToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type NeutralMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string; images?: string[] }
  | { role: "assistant"; content: string | null; toolCalls?: NeutralToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type CompletionResult =
  | { kind: "text"; text: string }
  | { kind: "tool_calls"; calls: NeutralToolCall[]; assistantText: string | null };

const DEFAULT_MAX_OUTPUT_TOKENS = 900;

export async function completeChat(input: {
  settings: AiSettings;
  messages: NeutralMessage[];
  tools?: NeutralToolSpec[];
  maxOutputTokens?: number;
}): Promise<CompletionResult> {
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  if (input.settings.provider === AiProvider.CLAUDE) {
    return completeWithClaude(input.settings, input.messages, input.tools ?? [], maxOutputTokens);
  }
  if (input.settings.provider === AiProvider.OPENROUTER) {
    return completeWithOpenRouter(input.settings, input.messages, input.tools ?? [], maxOutputTokens);
  }
  return completeWithOpenAI(input.settings, input.messages, input.tools ?? [], maxOutputTokens);
}

function toOpenAiMessages(messages: NeutralMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant" as const,
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: call.argumentsJson }
              }))
            }
          : {})
      };
    }
    if (message.role === "tool") {
      return { role: "tool" as const, tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.role === "user" && message.images?.length) {
      return {
        role: "user" as const,
        content: [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          ...message.images.map((url) => ({ type: "image_url" as const, image_url: { url } }))
        ]
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAiTools(tools: NeutralToolSpec[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

type OpenAiStyleChoiceMessage = {
  content?: string | null;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
};

function fromOpenAiStyleMessage(message: OpenAiStyleChoiceMessage | undefined): CompletionResult {
  const toolCalls = (message?.tool_calls ?? [])
    .filter((call) => call.function?.name)
    .map((call, index) => ({
      id: call.id || `call_${index}`,
      name: call.function?.name ?? "",
      argumentsJson: call.function?.arguments ?? "{}"
    }));

  if (toolCalls.length > 0) {
    return { kind: "tool_calls", calls: toolCalls, assistantText: message?.content?.trim() || null };
  }

  const text = message?.content?.trim();
  if (!text) throw new AiProviderError("A IA não retornou uma resposta.");
  return { kind: "text", text };
}

async function completeWithOpenAI(
  settings: AiSettings,
  messages: NeutralMessage[],
  tools: NeutralToolSpec[],
  maxOutputTokens: number
): Promise<CompletionResult> {
  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined
  });

  const response = await openai.chat.completions.create({
    model: settings.model,
    messages: toOpenAiMessages(messages),
    ...(tools.length ? { tools: toOpenAiTools(tools), tool_choice: "auto" as const } : {}),
    max_completion_tokens: maxOutputTokens
  });

  return fromOpenAiStyleMessage(response.choices[0]?.message);
}

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "completed"; result: CompletionResult };

/**
 * Versão em streaming. Emite deltas de texto em tempo real para OpenAI, OpenRouter e Claude.
 * Fallback não-streaming para outros provedores.
 */
export async function* streamChat(input: {
  settings: AiSettings;
  messages: NeutralMessage[];
  tools?: NeutralToolSpec[];
  maxOutputTokens?: number;
}): AsyncGenerator<ChatStreamEvent> {
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const tools = input.tools ?? [];

  if (input.settings.provider === AiProvider.OPENAI || input.settings.provider === AiProvider.OPENROUTER) {
    yield* streamChatOpenAiStyle(input.settings, input.messages, tools, maxOutputTokens);
    return;
  }

  if (input.settings.provider === AiProvider.CLAUDE) {
    yield* streamChatClaude(input.settings, input.messages, tools, maxOutputTokens);
    return;
  }

  // Fallback: não-streaming
  const result = await completeChat({ settings: input.settings, messages: input.messages, tools, maxOutputTokens });
  if (result.kind === "text") yield { type: "delta", text: result.text };
  yield { type: "completed", result };
}

async function* streamChatOpenAiStyle(
  settings: AiSettings,
  messages: NeutralMessage[],
  tools: NeutralToolSpec[],
  maxOutputTokens: number
): AsyncGenerator<ChatStreamEvent> {
  const openai = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl || undefined });
  const stream = await openai.chat.completions.create({
    model: settings.model,
    messages: toOpenAiMessages(messages),
    ...(tools.length ? { tools: toOpenAiTools(tools), tool_choice: "auto" as const } : {}),
    max_completion_tokens: maxOutputTokens,
    stream: true
  });

  let text = "";
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      text += delta.content;
      yield { type: "delta", text: delta.content };
    }
    for (const call of delta?.tool_calls ?? []) {
      const slot = toolAcc.get(call.index) ?? { id: "", name: "", args: "" };
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.name = call.function.name;
      if (call.function?.arguments) slot.args += call.function.arguments;
      toolAcc.set(call.index, slot);
    }
  }

  const calls = [...toolAcc.values()]
    .filter((slot) => slot.name)
    .map((slot, index) => ({ id: slot.id || `call_${index}`, name: slot.name, argumentsJson: slot.args || "{}" }));

  if (calls.length > 0) {
    yield { type: "completed", result: { kind: "tool_calls", calls, assistantText: text.trim() || null } };
    return;
  }
  if (!text.trim()) throw new AiProviderError("A IA não retornou uma resposta.");
  yield { type: "completed", result: { kind: "text", text } };
}

async function* streamChatClaude(
  settings: AiSettings,
  messages: NeutralMessage[],
  tools: NeutralToolSpec[],
  maxOutputTokens: number
): AsyncGenerator<ChatStreamEvent> {
  const payload = toClaudePayload(messages);
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxOutputTokens,
      system: payload.system,
      messages: payload.messages,
      stream: true,
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters
            }))
          }
        : {})
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AiProviderError(errorText || `Claude API ${response.status}`, response.status);
  }
  if (!response.body) throw new AiProviderError("Claude API returned empty response");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolCalls: Array<{ id: string; name: string; argumentsJson: string; input: Record<string, unknown> }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let json: any;
      try {
        json = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      // Text delta
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        text += json.delta.text;
        yield { type: "delta", text: json.delta.text };
      }

      // Tool use start
      if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
        toolCalls.push({
          id: json.content_block.id,
          name: json.content_block.name,
          argumentsJson: "{}",
          input: {}
        });
      }

      // Tool input delta
      if (json.type === "content_block_delta" && json.delta?.type === "input_json_delta" && toolCalls.length) {
        toolCalls[toolCalls.length - 1].argumentsJson += json.delta.partial_json;
        try {
          toolCalls[toolCalls.length - 1].input = JSON.parse(toolCalls[toolCalls.length - 1].argumentsJson);
        } catch {
          // incomplete JSON, wait for next delta
        }
      }
    }
  }

  // Final delta if any buffered data
  if (buffer.startsWith("data: ")) {
    try {
      const json = JSON.parse(buffer.slice(6));
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        text += json.delta.text;
        yield { type: "delta", text: json.delta.text };
      }
    } catch {
      // ignore
    }
  }

  if (toolCalls.length > 0) {
    yield { type: "completed", result: { kind: "tool_calls", calls: toolCalls, assistantText: text.trim() || null } };
    return;
  }
  if (!text.trim()) throw new AiProviderError("A IA não retornou uma resposta.");
  yield { type: "completed", result: { kind: "text", text } };
}

async function completeWithOpenRouter(
  settings: AiSettings,
  messages: NeutralMessage[],
  tools: NeutralToolSpec[],
  maxOutputTokens: number
): Promise<CompletionResult> {
  const response = await fetch(settings.baseUrl || "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
      ...(settings.siteUrl ? { "HTTP-Referer": settings.siteUrl } : {}),
      ...(settings.appName ? { "X-Title": settings.appName } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      messages: toOpenAiMessages(messages),
      ...(tools.length ? { tools: toOpenAiTools(tools), tool_choice: "auto" } : {}),
      max_tokens: maxOutputTokens
    })
  });

  const data = await readJsonResponse(response);
  return fromOpenAiStyleMessage(data.choices?.[0]?.message);
}

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toClaudePayload(messages: NeutralMessage[]) {
  const systemParts: string[] = [];
  const converted: Array<{ role: "user" | "assistant"; content: string | ClaudeContentBlock[] }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (converted.length === 0) {
        systemParts.push(message.content);
      } else {
        converted.push({ role: "user", content: `[Instrução do sistema] ${message.content}` });
      }
      continue;
    }

    if (message.role === "user") {
      if (message.images?.length) {
        const blocks: ClaudeContentBlock[] = [];
        if (message.content) blocks.push({ type: "text", text: message.content });
        for (const url of message.images) blocks.push({ type: "image", source: { type: "url", url } });
        converted.push({ role: "user", content: blocks });
      } else {
        converted.push({ role: "user", content: message.content });
      }
      continue;
    }

    if (message.role === "assistant") {
      const blocks: ClaudeContentBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: safeJsonParse(call.argumentsJson) });
      }
      converted.push({ role: "assistant", content: blocks.length ? blocks : "" });
      continue;
    }

    // tool result: agrupa resultados consecutivos em uma única mensagem de usuário
    const resultBlock: ClaudeContentBlock = { type: "tool_result", tool_use_id: message.toolCallId, content: message.content };
    const last = converted[converted.length - 1];
    if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((block) => block.type === "tool_result")) {
      last.content.push(resultBlock);
    } else {
      converted.push({ role: "user", content: [resultBlock] });
    }
  }

  return { system: systemParts.join("\n\n") || undefined, messages: converted };
}

async function completeWithClaude(
  settings: AiSettings,
  messages: NeutralMessage[],
  tools: NeutralToolSpec[],
  maxOutputTokens: number
): Promise<CompletionResult> {
  const payload = toClaudePayload(messages);
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxOutputTokens,
      system: payload.system,
      messages: payload.messages,
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters
            }))
          }
        : {})
    })
  });

  const data = await readJsonResponse(response);
  const blocks: Array<{ type?: string; id?: string; name?: string; input?: unknown; text?: string }> = data.content ?? [];

  const toolCalls = blocks
    .filter((block) => block.type === "tool_use" && block.name)
    .map((block, index) => ({
      id: block.id || `call_${index}`,
      name: block.name as string,
      argumentsJson: JSON.stringify(block.input ?? {})
    }));
  const text = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (toolCalls.length > 0) {
    return { kind: "tool_calls", calls: toolCalls, assistantText: text || null };
  }
  if (!text) throw new AiProviderError("A IA não retornou uma resposta.");
  return { kind: "text", text };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AiProviderError("O provedor de IA retornou uma resposta inválida.", response.status);
  }

  if (!response.ok) {
    const message = data.error?.message ?? data.message ?? `Erro ${response.status} no provedor de IA.`;
    throw new AiProviderError(message, response.status);
  }

  return data;
}
