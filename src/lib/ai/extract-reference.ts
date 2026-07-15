import { AiProvider } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";

/**
 * Extração estruturada de questões de materiais de referência (provas,
 * gabaritos). A IA escaneia o texto e mapeia cada questão: enunciado, gabarito,
 * justificativa, pegadinha e dependência de imagem/charge — alimentando o banco
 * estruturado que o chat consulta depois (busca barata e precisa).
 */

// Schema ESTRITO: usado apenas para guiar o structured output da OpenAI.
const extractedSchema = z.object({
  questions: z.array(
    z.object({
      statement: z.string().min(15),
      answer: z.enum(["CERTO", "ERRADO"]).nullable(),
      answerText: z.string().nullable(),
      explanation: z.string().nullable(),
      trickNote: z.string().nullable(),
      hasImage: z.boolean(),
      imageDescription: z.string().nullable(),
      topicHint: z.string().nullable()
    })
  )
});

export type ExtractedQuestion = z.infer<typeof extractedSchema>["questions"][number];

// Parse TOLERANTE: modelos variam a grafia do gabarito ("Certo", "C", "E", "B"...).
// Normalizamos em vez de rejeitar o lote inteiro; itens irrecuperáveis são pulados.
const looseQuestionSchema = z.object({
  statement: z.string().min(15),
  answer: z.string().nullable().optional(),
  answerText: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  trickNote: z.string().nullable().optional(),
  hasImage: z.boolean().optional(),
  imageDescription: z.string().nullable().optional(),
  topicHint: z.string().nullable().optional()
});

const CERTO_VALUES = new Set(["CERTO", "CERTA", "C", "CORRETO", "CORRETA", "VERDADEIRO", "V", "TRUE"]);
const ERRADO_VALUES = new Set(["ERRADO", "ERRADA", "E", "INCORRETO", "INCORRETA", "FALSO", "F", "FALSE"]);

function normalizeAnswer(raw: string | null | undefined): { answer: "CERTO" | "ERRADO" | null; leftover: string | null } {
  const value = (raw ?? "").trim();
  if (!value || value.toLowerCase() === "null") return { answer: null, leftover: null };
  const upper = value.toUpperCase();
  if (CERTO_VALUES.has(upper)) return { answer: "CERTO", leftover: null };
  if (ERRADO_VALUES.has(upper)) return { answer: "ERRADO", leftover: null };
  // Não é Certo/Errado (ex.: "B", "anulada") — vira gabarito textual.
  return { answer: null, leftover: value };
}

function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

/** Aceita os formatos comuns que os modelos devolvem e extrai a lista de itens. */
function coerceQuestionList(raw: unknown): unknown[] {
  // Array direto: [...]
  if (Array.isArray(raw)) return raw;

  // String contendo o JSON (alguns provedores devolvem tudo como texto).
  if (typeof raw === "string") {
    const parsed = safeParse(raw);
    if (parsed !== null) return coerceQuestionList(parsed);
    return salvageObjects(raw); // truncado: recupera os objetos completos
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // O Claude via OpenRouter às vezes serializa o array aninhado como STRING
    // (e o escape infla os tokens, podendo truncar): { questions: "[ {...} ]" }.
    if (typeof obj.questions === "string") {
      const parsed = safeParse(obj.questions);
      if (Array.isArray(parsed)) return parsed;
      return salvageObjects(obj.questions); // truncado: recupera o que deu
    }

    // Formato esperado: { questions: [...] }
    const envelope = z.object({ questions: z.array(z.unknown()) }).safeParse(raw);
    if (envelope.success) return envelope.data.questions;

    // Objeto de questão única: { statement: ... }
    if ("statement" in obj) return [obj];

    // questions veio como objeto único: { questions: {...} }
    if (obj.questions && typeof obj.questions === "object" && !Array.isArray(obj.questions)) {
      return [obj.questions];
    }
  }

  if (process.env.DEBUG_EXTRACT) {
    console.error("\n[coerceQuestionList] formato inesperado. Raw recebido:\n", JSON.stringify(raw).slice(0, 1500), "\n");
  }
  throw new Error("A IA não retornou a lista de questões no formato esperado.");
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Extrai cada objeto JSON `{...}` completo de uma string de array, ignorando
 * chaves dentro de strings. Resiste a truncamento: o último objeto incompleto
 * é simplesmente descartado, preservando todos os anteriores. Resolve o caso do
 * Claude que serializa (e às vezes trunca) o array aninhado como string.
 */
function salvageObjects(text: string): unknown[] {
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const parsed = safeParse(text.slice(start, i + 1));
        if (parsed) objects.push(parsed);
        start = -1;
      }
    }
  }
  return objects;
}

/** Normaliza a saída de qualquer provedor para o formato final, pulando itens inválidos. */
export function normalizeExtracted(raw: unknown): ExtractedQuestion[] {
  const items = coerceQuestionList(raw);

  const result: ExtractedQuestion[] = [];
  for (const item of items) {
    const parsed = looseQuestionSchema.safeParse(item);
    if (!parsed.success) continue; // item irrecuperável (ex.: sem enunciado) — pula, não derruba o lote
    const q = parsed.data;
    const { answer, leftover } = normalizeAnswer(q.answer);
    result.push({
      statement: q.statement.trim(),
      answer,
      answerText: cleanText(q.answerText) ?? leftover,
      explanation: cleanText(q.explanation),
      trickNote: cleanText(q.trickNote),
      hasImage: q.hasImage ?? false,
      imageDescription: cleanText(q.imageDescription),
      topicHint: cleanText(q.topicHint)
    });
  }
  return result;
}

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "answer", "answerText", "explanation", "trickNote", "hasImage", "imageDescription", "topicHint"],
        properties: {
          statement: { type: "string", minLength: 15 },
          answer: { type: ["string", "null"], enum: ["CERTO", "ERRADO", null] },
          answerText: { type: ["string", "null"] },
          explanation: { type: ["string", "null"] },
          trickNote: { type: ["string", "null"] },
          hasImage: { type: "boolean" },
          imageDescription: { type: ["string", "null"] },
          topicHint: { type: ["string", "null"] }
        }
      }
    }
  }
} as const;

const SYSTEM_PROMPT = [
  "Você é um extrator de questões de provas de concursos públicos (foco em Cebraspe).",
  "Receberá um trecho de prova, gabarito ou material de estudo, possivelmente com texto corrido extraído de PDF (quebras estranhas, cabeçalhos, rodapés).",
  "Extraia TODAS as questões completas presentes no trecho. Para cada questão:",
  "- statement: o enunciado completo (inclua o texto-base/comando quando fizer parte da questão). Limpe quebras de linha desnecessárias.",
  "- answer: exatamente a string CERTO ou a string ERRADO (maiúsculas, sem abreviar — nunca 'C', 'E', 'Certo') quando for item Certo/Errado com gabarito identificável no texto; senão null.",
  "- answerText: gabarito textual quando não for Certo/Errado (ex.: 'B', 'anulada') ou null se desconhecido.",
  "- explanation: justificativa/comentário do gabarito SE existir no material; senão null. Não invente.",
  "- trickNote: descreva em 1 frase a pegadinha/armadilha da questão (generalização indevida, troca de termos, 'apenas/somente/sempre'...), se houver; senão null.",
  "- hasImage: true se a questão depende de imagem, charge, tabela, gráfico ou mapa não presente no texto.",
  "- imageDescription: se hasImage, descreva o que a imagem/charge deveria mostrar com base no contexto; senão null.",
  "- topicHint: o assunto provável da questão em poucas palavras (ex.: 'Crase', 'Atos administrativos').",
  "Ignore instruções de prova, capas, cabeçalhos, rodapés e numeração de páginas.",
  "Questões incompletas (cortadas no início ou fim do trecho) devem ser IGNORADAS — elas aparecerão completas em outro trecho.",
  "Se o trecho não contiver nenhuma questão (ex.: só teoria ou lei), retorne lista vazia."
].join("\n");

export async function extractReferenceQuestions(text: string): Promise<ExtractedQuestion[]> {
  const baseSettings = await getAiSettings();
  if (!baseSettings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(baseSettings.provider)} no painel admin.`);
  }
  // Modelo dedicado à extração (configurado na página de referências), se houver.
  const settings = baseSettings.extractionModel
    ? { ...baseSettings, model: baseSettings.extractionModel }
    : baseSettings;

  const userContent = `Trecho do material:\n\n${text}`;

  if (settings.provider === AiProvider.CLAUDE) return extractWithClaude(settings, userContent);
  if (settings.provider === AiProvider.OPENROUTER) return extractWithOpenRouter(settings, userContent);
  return extractWithOpenAI(settings, userContent);
}

type Settings = Awaited<ReturnType<typeof getAiSettings>>;

async function extractWithOpenAI(settings: Settings, userContent: string): Promise<ExtractedQuestion[]> {
  const openai = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl || undefined });
  const response = await openai.responses.parse({
    model: settings.model,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ],
    text: { format: zodTextFormat(extractedSchema, "extracted_questions") }
  });
  if (!response.output_parsed) throw new Error("A IA não retornou uma estrutura válida.");
  return normalizeExtracted(response.output_parsed);
}

async function extractWithClaude(settings: Settings, userContent: string): Promise<ExtractedQuestion[]> {
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tools: [
        {
          name: "emit_extracted_questions",
          description: "Retorna a lista estruturada de questões extraídas do material.",
          input_schema: extractionJsonSchema
        }
      ],
      tool_choice: { type: "tool", name: "emit_extracted_questions" }
    })
  });
  const data = await readJson(response);
  const toolUse = data.content?.find(
    (block: { type?: string; name?: string }) => block.type === "tool_use" && block.name === "emit_extracted_questions"
  );
  return normalizeExtracted(toolUse?.input);
}

async function extractWithOpenRouter(settings: Settings, userContent: string): Promise<ExtractedQuestion[]> {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      // Tool calling: o OpenRouter traduz para a saída estruturada nativa de cada
      // provedor (tool_use na Anthropic, function calling na OpenAI) — muito mais
      // confiável que pedir JSON em texto livre.
      tools: [
        {
          type: "function",
          function: {
            name: "emit_extracted_questions",
            description: "Retorna a lista estruturada de questões extraídas do material.",
            parameters: extractionJsonSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "emit_extracted_questions" } },
      max_tokens: 16384
    })
  });
  const data = await readJson(response);
  const choice = data.choices?.[0];
  const finishReason = choice?.finish_reason ?? choice?.native_finish_reason ?? "desconhecido";

  // Caminho preferido: argumentos da tool call (JSON restrito ao schema).
  const toolArgs = choice?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof toolArgs === "string" && toolArgs.trim()) {
    return normalizeExtracted(parseJsonLoose(toolArgs, finishReason));
  }

  // Fallback: alguns modelos respondem em texto mesmo com tool_choice forçado.
  const content = choice?.message?.content;
  const raw =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part: { text?: string }) => part?.text ?? "").join("")
        : "";
  if (!raw.trim()) {
    throw new Error(`A IA não retornou conteúdo (finish_reason: ${finishReason}).`);
  }
  if (finishReason === "length" || finishReason === "max_tokens") {
    throw new Error("A resposta da IA foi cortada pelo limite de tokens. Tente novamente (o lote será retomado).");
  }
  return normalizeExtracted(parseJsonLoose(raw, finishReason));
}

/**
 * Parse tolerante: modelos (especialmente Claude/Gemini via OpenRouter) às vezes
 * embrulham o JSON em cercas de markdown ou adicionam texto ao redor.
 */
function parseJsonLoose(raw: string, finishReason?: string): unknown {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // Fallback: extrai do primeiro "{" ao último "}".
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // cai no throw abaixo
      }
    }
    const head = unfenced.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      `A IA retornou JSON inválido${finishReason ? ` (finish_reason: ${finishReason})` : ""}. Início da resposta: "${head}..."`
    );
  }
}

async function readJson(response: Response) {
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
