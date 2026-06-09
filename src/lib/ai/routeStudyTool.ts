import { AiProvider } from "@prisma/client";
import OpenAI from "openai";
import { getAiSettings } from "@/lib/ai/settings";
import { isStudyToolName, type StudyToolName, studyToolNames } from "@/lib/ai/study-tools";

export async function routeStudyToolWithAi(input: {
  prompt: string;
  context?: string;
}): Promise<{ toolName: StudyToolName | null; model: string }> {
  const settings = await getAiSettings();
  if (!settings.apiKey) throw new Error("Configure um provedor de IA no painel admin.");

  const system = [
    "Você é um roteador de ferramentas internas de uma plataforma de estudos para concursos.",
    "Escolha uma ferramenta somente quando a mensagem do usuário pedir dados do próprio histórico de estudo.",
    "Não responda ao usuário. Retorne apenas JSON válido.",
    "Ferramentas permitidas:",
    "- MOST_MISSED_QUESTIONS: perguntas sobre questões/temas que o usuário mais errou.",
    "- WORST_SUBJECT: perguntas sobre pior matéria, desempenho fraco ou onde o usuário está pior.",
    "- GENERATE_REVIEW_FROM_MISTAKES: pedidos para gerar revisão com base nos erros do usuário.",
    "- RECENT_CORRECT_ANSWERS: perguntas sobre últimos acertos ou questões acertadas.",
    "- FAVORITE_QUESTIONS: perguntas sobre questões favoritas.",
    "Se nenhuma ferramenta fizer sentido, use null.",
    `Formato: {"toolName": ${JSON.stringify([...studyToolNames, null])}}`
  ].join("\n");
  const userContent = [input.context ? `Contexto recente:\n${input.context}` : "", `Mensagem:\n${input.prompt}`]
    .filter(Boolean)
    .join("\n\n");

  const text =
    settings.provider === AiProvider.CLAUDE
      ? await routeWithClaude(settings, system, userContent)
      : settings.provider === AiProvider.OPENROUTER
        ? await routeWithOpenRouter(settings, system, userContent)
        : await routeWithOpenAI(settings, system, userContent);

  return { toolName: parseToolName(text), model: settings.model };
}

async function routeWithOpenAI(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
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
    max_output_tokens: 120
  });

  return response.output_text ?? "";
}

async function routeWithClaude(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 120,
      system,
      messages: [{ role: "user", content: userContent }]
    })
  });

  const data = await readJsonResponse(response);
  return (
    data.content
      ?.filter((block: { type?: string }) => block.type === "text")
      .map((block: { text?: string }) => block.text)
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

async function routeWithOpenRouter(settings: Awaited<ReturnType<typeof getAiSettings>>, system: string, userContent: string) {
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
      max_tokens: 120
    })
  });

  const data = await readJsonResponse(response);
  return data.choices?.[0]?.message?.content ?? "";
}

function parseToolName(text: string): StudyToolName | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const raw = jsonMatch?.[0] ?? text;

  try {
    const parsed = JSON.parse(raw) as { toolName?: string | null };
    return isStudyToolName(parsed.toolName) ? parsed.toolName : null;
  } catch {
    const direct = studyToolNames.find((toolName) => text.includes(toolName));
    return direct ?? null;
  }
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
    const message = data.error?.message ?? data.message ?? `Erro ${response.status} no provedor de IA.`;
    throw new Error(message);
  }

  return data;
}
