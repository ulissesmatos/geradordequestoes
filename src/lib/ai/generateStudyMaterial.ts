import { AiProvider } from "@prisma/client";
import OpenAI from "openai";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";

function stripTrailingAiQuestion(content: string): string {
  const trimmed = content.trim();
  const paras = trimmed.split(/\n{2,}/);
  if (paras.length <= 1) return trimmed;
  const last = paras[paras.length - 1].trim();
  if (last.endsWith("?") && !last.startsWith("#") && !/^[-*\d]/.test(last)) {
    return paras.slice(0, -1).join("\n\n").trim();
  }
  return trimmed;
}

export async function generateStudyMaterial(input: {
  prompt: string;
  context?: string;
}) {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(settings.provider)} no painel admin.`);
  }

  const system = [
    "Você cria materiais de estudo para concursos públicos em português do Brasil.",
    "Retorne Markdown limpo, didático e organizado.",
    "Use título, índice curto, seções com ##, listas e um bloco final de revisão.",
    "Não gere questões completas aqui; no máximo inclua sugestões de treino.",
    "Não copie enunciados anteriores; use histórico apenas como direção pedagógica."
  ].join("\n");
  const userContent = [input.context ? `Contexto do aluno:\n${input.context}` : "", `Pedido:\n${input.prompt}`]
    .filter(Boolean)
    .join("\n\n");

  if (settings.provider === AiProvider.CLAUDE) return generateWithClaude(settings, system, userContent);
  if (settings.provider === AiProvider.OPENROUTER) return generateWithOpenRouter(settings, system, userContent);
  return generateWithOpenAI(settings, system, userContent);
}

async function generateWithOpenAI(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined
  });
  const response = await openai.responses.create({
    model: settings.model,
    input: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ],
    max_output_tokens: 1800
  });
  const text = response.output_text?.trim();
  if (!text) throw new Error("A IA não retornou um material.");
  return { content: stripTrailingAiQuestion(text), model: settings.model };
}

async function generateWithClaude(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1800,
      system,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await readJsonResponse(response);
  const text = data.content
    ?.filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) throw new Error("A IA não retornou um material.");
  return { content: stripTrailingAiQuestion(text), model: settings.model };
}

async function generateWithOpenRouter(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
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
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      max_tokens: 1800
    })
  });
  const data = await readJsonResponse(response);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("A IA não retornou um material.");
  return { content: stripTrailingAiQuestion(text), model: settings.model };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("O provedor de IA retornou uma resposta inválida.");
  }
  if (!response.ok) {
    throw new Error(data.error?.message ?? data.message ?? `Erro ${response.status} no provedor de IA.`);
  }
  return data;
}
