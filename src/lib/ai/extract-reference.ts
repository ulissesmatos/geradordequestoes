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

const extractedItemSchema = z.object({
  statement: z.string().min(15),
  answer: z.enum(["CERTO", "ERRADO"]).nullable(),
  answerText: z.string().nullable(),
  explanation: z.string().nullable(),
  trickNote: z.string().nullable(),
  hasImage: z.boolean(),
  imageDescription: z.string().nullable(),
  topicHint: z.string().nullable(),
  subjectHint: z.string().nullable(),
  regionHint: z.string().nullable()
});

// Schema ESTRITO: usado apenas para guiar o structured output da OpenAI.
const extractedSchema = z.object({
  groups: z.array(
    z.object({
      supportText: z.string().nullable(),
      questions: z.array(extractedItemSchema)
    })
  )
});

export type ExtractedQuestion = {
  statement: string;
  supportText: string | null;
  answer: "CERTO" | "ERRADO" | null;
  answerText: string | null;
  explanation: string | null;
  trickNote: string | null;
  hasImage: boolean;
  imageDescription: string | null;
  topicHint: string | null;
  subjectHint: string | null;
  regionHint: string | null;
};

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
  topicHint: z.string().nullable().optional(),
  subjectHint: z.string().nullable().optional(),
  regionHint: z.string().nullable().optional()
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

type RawGroup = { supportText?: string | null; questions: unknown[] };

/**
 * Aceita os formatos comuns que os modelos devolvem e extrai a lista de GRUPOS
 * (texto de apoio + questões). Tolerante a modelos que ignoram o wrapper "groups"
 * e devolvem só uma lista solta de questões (compat com o formato antigo): nesse
 * caso, vira um único grupo sem texto de apoio.
 */
function coerceGroupList(raw: unknown): RawGroup[] {
  // String contendo o JSON (alguns provedores devolvem tudo como texto).
  if (typeof raw === "string") {
    const parsed = safeParse(raw);
    if (parsed !== null) return coerceGroupList(parsed);
    return [{ supportText: null, questions: salvageObjects(raw) }]; // truncado: recupera o que deu, sem grupo
  }

  if (Array.isArray(raw)) {
    // Array de grupos ({supportText, questions} cada) ou array de questões soltas.
    if (raw.length > 0 && raw.every((item) => item && typeof item === "object" && "questions" in (item as object))) {
      return raw as RawGroup[];
    }
    return [{ supportText: null, questions: raw }];
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // Formato esperado: { groups: [...] } (às vezes serializado como string, igual "questions" antes).
    if (Array.isArray(obj.groups)) return coerceGroupList(obj.groups);
    if (typeof obj.groups === "string") return coerceGroupList(obj.groups);

    // Compat: modelo ignorou "groups" e devolveu o formato antigo { questions: [...] }.
    if (typeof obj.questions === "string") {
      const parsed = safeParse(obj.questions);
      if (Array.isArray(parsed)) return [{ supportText: null, questions: parsed }];
      return [{ supportText: null, questions: salvageObjects(obj.questions) }];
    }
    if (Array.isArray(obj.questions)) return [{ supportText: (obj.supportText as string | null) ?? null, questions: obj.questions }];

    // Objeto de questão única solta: { statement: ... }
    if ("statement" in obj) return [{ supportText: null, questions: [obj] }];
  }

  if (process.env.DEBUG_EXTRACT) {
    console.error("\n[coerceGroupList] formato inesperado. Raw recebido:\n", JSON.stringify(raw).slice(0, 1500), "\n");
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
  const groups = coerceGroupList(raw);

  const result: ExtractedQuestion[] = [];
  for (const group of groups) {
    const supportTextRaw = cleanText(group.supportText ?? null);
    // Texto de apoio curto demais é provavelmente "placeholder" (ex.: a IA escreveu uma
    // frase qualquer em vez de deixar null) — trata como ausente.
    const supportText = supportTextRaw && supportTextRaw.length >= 80 ? supportTextRaw : null;

    for (const item of group.questions ?? []) {
      const parsed = looseQuestionSchema.safeParse(item);
      if (!parsed.success) continue; // item irrecuperável (ex.: sem enunciado) — pula, não derruba o lote
      const q = parsed.data;
      const { answer, leftover } = normalizeAnswer(q.answer);
      result.push({
        statement: q.statement.trim(),
        supportText,
        answer,
        answerText: cleanText(q.answerText) ?? leftover,
        explanation: cleanText(q.explanation),
        trickNote: cleanText(q.trickNote),
        hasImage: q.hasImage ?? false,
        imageDescription: cleanText(q.imageDescription),
        topicHint: cleanText(q.topicHint),
        subjectHint: cleanText(q.subjectHint),
        regionHint: cleanText(q.regionHint)
      });
    }
  }
  return result;
}

const extractedItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "answer", "answerText", "explanation", "trickNote", "hasImage", "imageDescription", "topicHint", "subjectHint", "regionHint"],
  properties: {
    statement: { type: "string", minLength: 15 },
    answer: { type: ["string", "null"], enum: ["CERTO", "ERRADO", null] },
    answerText: { type: ["string", "null"] },
    explanation: { type: ["string", "null"] },
    trickNote: { type: ["string", "null"] },
    hasImage: { type: "boolean" },
    imageDescription: { type: ["string", "null"] },
    topicHint: { type: ["string", "null"] },
    subjectHint: { type: ["string", "null"] },
    regionHint: { type: ["string", "null"] }
  }
} as const;

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supportText", "questions"],
        properties: {
          supportText: { type: ["string", "null"] },
          questions: { type: "array", items: extractedItemJsonSchema }
        }
      }
    }
  }
} as const;

/**
 * `subjectNames` é o catálogo REAL de matérias cadastradas. Sem ele o modelo chutava nomes de
 * uma lista fixa de exemplos e o rótulo raramente casava com o banco, deixando a questão sem
 * matéria (ver resolveSubjectFromHint em src/lib/taxonomy.ts). Passar o catálogo aumenta a
 * taxa de casamento e reduz a criação automática de matérias novas.
 */
function buildSystemPrompt(subjectNames: string[]) {
  const subjectLine = subjectNames.length
    ? `- subjectHint: a MATÉRIA da questão. PREFIRA copiar EXATAMENTE um destes nomes já cadastrados no sistema: ${subjectNames.join(" | ")}. Só use um nome fora dessa lista se nenhum deles descrever a questão; nesse caso devolva um rótulo curto (1 a 4 palavras), nunca uma frase. Cuidado pra não confundir Geografia (espaço/território/clima/população) com História (eventos e processos ao longo do tempo).`
    : "- subjectHint: a MATÉRIA da questão, um nome curto e comum em concursos (ex.: 'Português', 'Matemática', 'Raciocínio Lógico', 'Direito Constitucional', 'Direito Administrativo', 'Direito Penal', 'Informática', 'Geografia', 'História', 'Atualidades'). Nunca uma frase. Cuidado pra não confundir Geografia (espaço/território/clima/população) com História (eventos e processos ao longo do tempo).";
  return SYSTEM_PROMPT_BASE.replace(SUBJECT_HINT_PLACEHOLDER, subjectLine);
}

const SUBJECT_HINT_PLACEHOLDER = "__SUBJECT_HINT_LINE__";

const SYSTEM_PROMPT_BASE = [
  "Você é um extrator de questões de provas de concursos públicos (foco em Cebraspe).",
  "Receberá um trecho de prova, gabarito ou material de estudo, possivelmente com texto corrido extraído de PDF (quebras estranhas, cabeçalhos, rodapés). Às vezes o trecho vem dividido em duas partes marcadas: '[CONTEXTO DO TRECHO ANTERIOR]' (conteúdo já processado antes — NÃO extraia questões dali, use só se um texto de apoio começar lá e continuar na parte nova) e '[TRECHO NOVO]' (extraia as questões daqui).",
  'Estrutura da resposta: agrupe as questões em "groups". Cada group tem um "supportText" e uma lista "questions".',
  "- REGRA CRÍTICA (padrão muito comum do Cebraspe): um texto-base (texto de leitura, situação hipotética, trecho de lei) aparece UMA VEZ, seguido por um comando ('julgue os itens/próximos itens/itens subsequentes...') e depois vários itens numerados que o julgam. Quando isso acontecer: coloque o texto-base COMPLETO E LITERAL (todos os parágrafos, palavra por palavra, sem resumir e sem cortar) no campo \"supportText\" do group; cada item numerado vira uma questão em \"questions\", e o statement de cada uma é SÓ o comando/afirmação específica daquele item — NÃO repita o texto-base dentro do statement, ele já acompanha a questão automaticamente pelo supportText do group.",
  "- Quando as questões forem independentes (não compartilham texto-base), use supportText null nesse group.",
  "- PROIBIDO: nunca escreva no statement uma referência genérica e vazia ao texto-base (ex.: \"sobre o texto precedente\", \"considerando a situação hipotética apresentada\") deixando supportText null quando existe um texto-base real no material — isso deixa a questão impossível de responder. Se o item depende de um texto, ou o texto vai no supportText, ou o item é ignorado (regra abaixo).",
  "- Se um item depende claramente de um texto-base que NÃO está completo neste trecho (foi cortado, ou você só vê o comando 'julgue os itens' sem o texto em si) — trate esse item como INCOMPLETO e IGNORE-o. NÃO resuma nem invente o texto que falta; ele será capturado corretamente em outro trecho que contenha o texto inteiro.",
  "- statement: o comando/afirmação específica da questão (sem o texto-base, que vai em supportText quando houver). Deve ser compreensível junto com o supportText do group. Limpe quebras de linha desnecessárias.",
  "- answer: exatamente a string CERTO ou a string ERRADO (maiúsculas, sem abreviar — nunca 'C', 'E', 'Certo') quando for item Certo/Errado com gabarito identificável no texto; senão null.",
  "- answerText: gabarito textual quando não for Certo/Errado (ex.: 'B', 'anulada') ou null se desconhecido.",
  "- explanation: justificativa/comentário do gabarito SE existir no material; senão null. Não invente.",
  "- trickNote: descreva em 1 frase a pegadinha/armadilha da questão (generalização indevida, troca de termos, 'apenas/somente/sempre'...), se houver; senão null.",
  "- hasImage: true se a questão depende de imagem, charge, tabela, gráfico ou mapa não presente no texto.",
  "- imageDescription: se hasImage, descreva o que a imagem/charge deveria mostrar com base no contexto; senão null.",
  "- topicHint: o assunto provável da questão em poucas palavras (ex.: 'Crase', 'Atos administrativos').",
  SUBJECT_HINT_PLACEHOLDER,
  "- regionHint: quando a questão for especificamente sobre um estado/região do Brasil (legislação estadual, geografia ou história de um estado específico), o nome do estado (ex.: 'Maranhão', 'Ceará', 'São Paulo'); null quando o conteúdo for nacional/genérico ou sem relação com um estado específico.",
  "Ignore instruções de prova, capas, cabeçalhos, rodapés e numeração de páginas.",
  "Questões incompletas (cortadas no início ou fim do trecho, OU dependentes de um texto-base ausente/incompleto) devem ser IGNORADAS — elas aparecerão completas em outro trecho.",
  "Se a parte nova do trecho não contiver nenhuma questão (ex.: só teoria ou lei), retorne groups vazio."
].join("\n");

export type ExtractionResult = { questions: ExtractedQuestion[]; model: string; provider: AiProvider };

/**
 * Retorna também `model`/`provider` efetivamente usados (não só as questões) para
 * que o chamador possa registrar em auditoria qual modelo rodou de fato — a única
 * forma confiável de confirmar o que foi usado, já que a extração não passa pelo
 * log de uso de IA (AiUsageEvent) que alimenta /admin/logs-ia.
 */
export async function extractReferenceQuestions(text: string, subjectNames: string[] = []): Promise<ExtractionResult> {
  const baseSettings = await getAiSettings();
  if (!baseSettings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(baseSettings.provider)} no painel admin.`);
  }
  // Modelo dedicado à extração (configurado na página de referências), se houver.
  const settings = baseSettings.extractionModel
    ? { ...baseSettings, model: baseSettings.extractionModel }
    : baseSettings;

  const userContent = `Trecho do material:\n\n${text}`;
  const systemPrompt = buildSystemPrompt(subjectNames);

  const questions =
    settings.provider === AiProvider.CLAUDE
      ? await extractWithClaude(settings, userContent, systemPrompt)
      : settings.provider === AiProvider.OPENROUTER
        ? await extractWithOpenRouter(settings, userContent, systemPrompt)
        : await extractWithOpenAI(settings, userContent, systemPrompt);

  return { questions, model: settings.model, provider: settings.provider };
}

type Settings = Awaited<ReturnType<typeof getAiSettings>>;

async function extractWithOpenAI(settings: Settings, userContent: string, systemPrompt: string): Promise<ExtractedQuestion[]> {
  const openai = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl || undefined });
  const response = await openai.responses.parse({
    model: settings.model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    text: { format: zodTextFormat(extractedSchema, "extracted_questions") }
  });
  if (!response.output_parsed) throw new Error("A IA não retornou uma estrutura válida.");
  return normalizeExtracted(response.output_parsed);
}

async function extractWithClaude(settings: Settings, userContent: string, systemPrompt: string): Promise<ExtractedQuestion[]> {
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
      system: systemPrompt,
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

async function extractWithOpenRouter(settings: Settings, userContent: string, systemPrompt: string): Promise<ExtractedQuestion[]> {
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
        { role: "system", content: systemPrompt },
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
