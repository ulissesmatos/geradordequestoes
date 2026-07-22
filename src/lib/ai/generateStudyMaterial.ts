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

/**
 * Aprofunda UMA seção de um material existente (botão "Aprofundar" na página do
 * material). Retorna só o corpo em markdown a ser inserido no fim da seção —
 * sem repetir o título e sem headings, para não quebrar a estrutura de seções
 * em expansões futuras (MarkdownContent também não renderiza ####).
 */
export async function expandStudyMaterialSection(input: {
  materialTitle: string;
  materialContent: string;
  headingText: string;
  sectionContent?: string;
  subjectName?: string;
  topicName?: string;
}) {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(settings.provider)} no painel admin.`);
  }

  const system = [
    "Você aprofunda uma seção específica de um material de estudo para concursos públicos, em português do Brasil.",
    "Regras obrigatórias:",
    "- Aprofunde APENAS a seção indicada; não escreva sobre o conteúdo das outras seções do material.",
    "- NÃO repita o que a seção já diz; acrescente profundidade: fundamentos, detalhes, exceções, exemplos práticos e pegadinhas típicas de prova (estilo Cebraspe).",
    "- Retorne SOMENTE o corpo em Markdown a ser acrescentado ao FINAL da seção.",
    "- NÃO repita o título da seção e NÃO crie nenhum título com # (nem ##, ###, ####); para subestruturas use parágrafos iniciados com **negrito**, listas ou tabelas.",
    '- Não escreva introduções ("Nesta seção...") nem conclusões genéricas; vá direto ao conteúdo.',
    "- Extensão alvo: 3 a 6 blocos (parágrafos, listas ou tabelas)."
  ].join("\n");

  const sectionBody = input.sectionContent?.trim();
  const header = [
    `Material: "${input.materialTitle}"`,
    input.subjectName ? `Disciplina: ${input.subjectName}` : "",
    input.topicName ? `Tópico: ${input.topicName}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const userContent = [
    header,
    `Conteúdo completo do material (apenas contexto, não reescreva):\n${input.materialContent.slice(0, 24_000)}`,
    `Seção a aprofundar: "${input.headingText}"`,
    sectionBody ? `Conteúdo atual da seção (não repita estas informações):\n${sectionBody.slice(0, 6_000)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const generated =
    settings.provider === AiProvider.CLAUDE
      ? await generateWithClaude(settings, system, userContent)
      : settings.provider === AiProvider.OPENROUTER
        ? await generateWithOpenRouter(settings, system, userContent)
        : await generateWithOpenAI(settings, system, userContent);

  const cleaned = demoteHeadingsToBold(stripLeadingHeadingEcho(generated.content, input.headingText));
  if (!cleaned.trim()) throw new Error("A IA não retornou um material.");
  return { content: cleaned, model: generated.model };
}

/** Remove a 1ª linha se for eco do próprio título da seção (com ou sem #s / **). */
function stripLeadingHeadingEcho(content: string, headingText: string): string {
  const lines = content.split("\n");
  const firstIdx = lines.findIndex((line) => line.trim() !== "");
  if (firstIdx === -1) return content;
  const first = lines[firstIdx]
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .trim();
  if (first.toLowerCase() === headingText.trim().toLowerCase()) {
    return lines.slice(firstIdx + 1).join("\n").trim();
  }
  return content;
}

/** Rebaixa headings desobedientes a parágrafos em negrito — não podem quebrar a estrutura de seções. */
function demoteHeadingsToBold(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*#{1,6}\s+(.+)$/);
      return match ? `**${match[1].trim()}**` : line;
    })
    .join("\n");
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
