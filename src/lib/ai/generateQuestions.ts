import { AiProvider, type Difficulty, type QuestionAnswer, type QuestionFormat, type QuestionSetMode } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";

/** Questão real usada como base 1:1 no modo "variação fiel" (perto do enunciado original). */
export type ReferenceVariantSource = {
  id: string;
  statement: string;
  /** Texto de apoio compartilhado do qual a questão original dependia, se houver. */
  supportText: string | null;
  answer: QuestionAnswer | null;
  answerText: string | null;
  explanation: string | null;
  trickNote: string | null;
};

const generatedItemSchema = z.object({
  statement: z.string().min(20),
  format: z.enum(["CERTO_ERRADO", "MULTIPLA_ESCOLHA"]),
  answer: z.enum(["CERTO", "ERRADO"]).nullable().optional(),
  explanation: z.string().min(10),
  difficulty: z.enum(["FACIL", "MEDIO", "DIFICIL"]),
  // Só preenchido no modo "variação fiel": índice (1-based) da questão de referência usada como base.
  sourceIndex: z.number().int().min(1).optional(),
  options: z.array(
    z.object({
      label: z.string().min(1).max(24),
      text: z.string().min(1),
      isCorrect: z.boolean()
    })
  )
});

/**
 * Estrutura em grupos: a maioria dos grupos tem 1 questão independente (supportText null),
 * mas — sobretudo em nível difícil — um grupo pode reunir várias questões que julgam o MESMO
 * texto de apoio (situação hipotética, trecho de lei, texto informativo), no estilo real do
 * Cebraspe. Achatado em questões individuais logo depois de receber a resposta da IA (ver
 * normalizeGenerated); o resto do app sempre trabalha com a lista achatada.
 */
const generatedQuestionSchema = z.object({
  groups: z.array(
    z.object({
      supportText: z
        .string()
        .min(80)
        .nullable()
        .optional()
        .describe("Texto de apoio compartilhado pelas questões deste grupo; null quando as questões forem independentes."),
      questions: z.array(generatedItemSchema).min(1)
    })
  )
});

export type GeneratedQuestion = z.infer<typeof generatedItemSchema> & { supportText: string | null };

/**
 * O front-end renderiza fórmulas com KaTeX a partir destes delimitadores (ver src/components/math-text.tsx).
 * Usa \( \) / \[ \] em vez de $ $ / $$ $$ porque textos de concurso citam valores em reais (ex.: "R$ 1.000,00"),
 * e um "$" solto quebraria o parser de fórmulas.
 */
const MATH_FORMATTING_INSTRUCTION =
  "Notação matemática: sempre que o enunciado, as alternativas ou a justificativa envolverem fórmulas, expressões, equações ou símbolos matemáticos (potências, frações, raízes, matrizes, números complexos, somatórios, letras gregas etc.), escreva-os em LaTeX delimitado por \\( ... \\) para fórmulas dentro do texto ou \\[ ... \\] para fórmulas em bloco/destaque. Nunca use apenas $ ou $$ como delimitador (pode ser confundido com valores em reais, ex. \"R$ 10,00\"). Fora desses casos, mantenha texto normal em português.";

const GROUP_STRUCTURE_INSTRUCTION =
  'Estrutura da resposta: agrupe as questões em "groups". Cada group tem um "supportText" (texto de apoio compartilhado) e uma lista "questions". Na maioria dos casos as questões são independentes entre si: use supportText null e distribua as questões em um ou mais groups sem texto compartilhado. A soma de todas as questões em todos os groups deve ser exatamente a quantidade pedida.';

/**
 * Só entra no prompt quando difficulty === "DIFICIL" — replica o padrão real do Cebraspe de
 * blocos "texto de apoio + vários itens Certo/Errado que o julgam", em vez de questões sempre
 * independentes.
 */
const SUPPORT_TEXT_INSTRUCTION =
  "Nível DIFÍCIL — texto de apoio: quando o assunto se prestar a isso (interpretação de texto, direito, legislação, história, temas com uma situação hipotética ou trecho normativo plausível — NÃO force em assuntos que não combinam, como pura gramática/ortografia/informática básica), gere um ou mais grupos no estilo real de prova: um supportText de 2 a 4 parágrafos (uma situação hipotética, um texto informativo ou um trecho de lei/norma) seguido de 3 a 6 questões — no formato já definido acima — que o julgam sob ângulos diferentes, assim como um bloco real de prova tem um texto seguido de vários itens numerados. Nem toda questão difícil precisa disso: use julgamento — se o tema não render um texto de apoio natural, gere itens independentes normalmente (supportText null).";

const generatedItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "format", "answer", "explanation", "difficulty", "options"],
  properties: {
    statement: { type: "string", minLength: 20 },
    format: { type: "string", enum: ["CERTO_ERRADO", "MULTIPLA_ESCOLHA"] },
    answer: { type: ["string", "null"], enum: ["CERTO", "ERRADO", null] },
    explanation: { type: "string", minLength: 10 },
    difficulty: { type: "string", enum: ["FACIL", "MEDIO", "DIFICIL"] },
    sourceIndex: { type: "integer", minimum: 1 },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text", "isCorrect"],
        properties: {
          label: { type: "string", maxLength: 24 },
          text: { type: "string" },
          isCorrect: { type: "boolean" }
        }
      }
    }
  }
} as const;

const questionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supportText", "questions"],
        properties: {
          supportText: { type: ["string", "null"], minLength: 80 },
          questions: { type: "array", minItems: 1, items: generatedItemJsonSchema }
        }
      }
    }
  }
} as const;

export async function generateQuestions(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  quantity: number;
  format?: QuestionFormat;
  alternativesCount?: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  /** Questões reais de prova para servir de âncora de estilo — bloco proeminente separado do contexto do aluno. */
  referenceContext?: string;
  /**
   * Modo "variação fiel": uma questão real por item, nesta ordem — a IA reaproveita boa parte do
   * enunciado original ajustando detalhes, em vez de só se inspirar no estilo. Quando presente,
   * substitui `quantity`/`referenceContext`: gera exatamente uma variação por item da lista.
   */
  referenceQuestions?: ReferenceVariantSource[];
  /** Modelo alternativo (mesma API key do provedor configurado). Vazio = modelo padrão. */
  modelOverride?: string;
}) {
  const baseSettings = await getAiSettings();
  if (!baseSettings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(baseSettings.provider)} no painel admin.`);
  }
  const settings = input.modelOverride?.trim()
    ? { ...baseSettings, model: input.modelOverride.trim() }
    : baseSettings;

  const format = input.format ?? "CERTO_ERRADO";
  const alternativesCount = clampAlternatives(input.alternativesCount ?? 4);
  const prompt =
    input.referenceQuestions && input.referenceQuestions.length > 0
      ? buildVariantPrompt({ ...input, format, alternativesCount, referenceQuestions: input.referenceQuestions })
      : buildPrompt({ ...input, format, alternativesCount, referenceContext: input.referenceContext });

  if (settings.provider === AiProvider.CLAUDE) {
    return generateWithClaude(settings, prompt);
  }

  if (settings.provider === AiProvider.OPENROUTER) {
    return generateWithOpenRouter(settings, prompt);
  }

  return generateWithOpenAI(settings, prompt);
}

function buildPrompt(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  quantity: number;
  format: QuestionFormat;
  alternativesCount: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  referenceContext?: string;
}) {
  const formatInstruction =
    input.format === "CERTO_ERRADO"
      ? "Formato: Certo/Errado. Cada questão deve ter exatamente duas opções: C) Certo e E) Errado. Use answer como CERTO ou ERRADO."
      : `Formato: múltipla escolha. Cada questão deve ter exatamente ${input.alternativesCount} alternativas, labels sequenciais começando em A, e apenas uma alternativa correta. Use answer como null.`;

  return [
    `Matéria: ${input.subject}`,
    `Assunto: ${input.topic}`,
    `Dificuldade: ${input.difficulty}`,
    `Quantidade: ${input.quantity}`,
    `Modo: ${input.mode ?? "ESTUDO"}`,
    formatInstruction,
    input.referenceContext
      ? `QUESTÕES REAIS DE PROVA (use como âncora de estilo, dificuldade, fraseado e pegadinhas):\n${input.referenceContext}\n\nProduza questões NOVAS e originais nesse mesmo estilo da banca (Cebraspe); espelhe as pegadinhas e a estrutura; NÃO copie verbatim.`
      : "",
    input.prompt ? `Pedido do usuário: ${input.prompt}` : "",
    input.extraInstructions ? `Instruções adicionais: ${input.extraInstructions}` : "",
    input.context ? `Contexto do aluno (histórico/desempenho): ${input.context}` : "",
    "Gere questões originais de concurso público.",
    "Não copie verbatim; inspire-se no estilo e nas pegadinhas das provas reais para criar itens inéditos.",
    "Use linguagem clara, objetiva e adequada a concurso.",
    "A justificativa deve explicar de forma didática por que a resposta correta está correta.",
    "Evite temas polêmicos ou desatualizados sem contexto.",
    GROUP_STRUCTURE_INSTRUCTION,
    input.difficulty === "DIFICIL" ? SUPPORT_TEXT_INSTRUCTION : "",
    MATH_FORMATTING_INSTRUCTION
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Prompt do modo "variação fiel": uma variação bem próxima por questão real, na ordem dada.
 * Diferente de buildPrompt (que só usa a referência como âncora de estilo), aqui a IA pode
 * reaproveitar boa parte do enunciado original — mas precisa reconferir o gabarito do zero,
 * porque pequenos ajustes de texto podem inverter a resposta correta.
 */
function buildVariantPrompt(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  format: QuestionFormat;
  alternativesCount: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  referenceQuestions: ReferenceVariantSource[];
}) {
  const formatInstruction =
    input.format === "CERTO_ERRADO"
      ? "Formato: Certo/Errado. Cada questão deve ter exatamente duas opções: C) Certo e E) Errado. Use answer como CERTO ou ERRADO."
      : `Formato: múltipla escolha. Cada questão deve ter exatamente ${input.alternativesCount} alternativas, labels sequenciais começando em A, e apenas uma alternativa correta. Use answer como null. Como a questão original não tem alternativas registradas, crie alternativas novas e plausíveis para o tema.`;

  const referenceBlock = input.referenceQuestions
    .map((q, i) => {
      const gabaritoOriginal = q.answer ?? q.answerText ?? "não informado";
      return [
        `[Questão de referência ${i + 1}] (gabarito original: ${gabaritoOriginal})`,
        q.supportText ? `Texto de apoio original:\n${q.supportText}\n` : "",
        q.statement,
        q.explanation ? `Justificativa original: ${q.explanation}` : "",
        q.trickNote ? `Pegadinha original: ${q.trickNote}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    `Matéria: ${input.subject}`,
    `Assunto: ${input.topic}`,
    `Dificuldade: ${input.difficulty}`,
    `Modo: ${input.mode ?? "ESTUDO"}`,
    formatInstruction,
    `MODO VARIAÇÃO FIEL: gere exatamente ${input.referenceQuestions.length} questão(ões) — uma variação bem próxima para CADA questão de referência abaixo, respeitando a ordem.`,
    "QUESTÕES DE REFERÊNCIA (reais, extraídas de provas anteriores):",
    referenceBlock,
    "Regras para cada variação:",
    "- Reaproveite a estrutura, o tema e boa parte do texto da questão de referência correspondente; pode manter grande parte do enunciado original, ajustando nomes, números, datas, órgãos, ordem dos itens ou pequenos detalhes de contexto.",
    "- Se a questão de referência tinha um \"Texto de apoio original\", sua variação também deve ter um texto de apoio (adaptado do original, com os mesmos ajustes de nomes/números/datas) — coloque-o no supportText do group dessa questão, não deixe null. Se a referência NÃO tinha texto de apoio, use supportText null.",
    "- Mantenha o mesmo nível de dificuldade e o mesmo tipo de pegadinha da questão original.",
    "- CRÍTICO: NÃO copie o gabarito original cegamente. Releia SOMENTE o enunciado que você reescreveu, do zero, e determine se ele é CERTO ou ERRADO (ou qual alternativa é correta) com base apenas no texto novo. Pequenas mudanças de palavra (ex.: trocar \"todos\" por \"alguns\", negar uma condição, trocar um verbo, inverter uma ordem) podem inverter o gabarito — se isso acontecer, ajuste a resposta e a justificativa para refletir o NOVO enunciado, não o original.",
    `- Preencha "sourceIndex" com o número (1 a ${input.referenceQuestions.length}) da questão de referência que serviu de base, na mesma ordem em que apareceram acima.`,
    input.prompt ? `Pedido do usuário: ${input.prompt}` : "",
    input.extraInstructions ? `Instruções adicionais: ${input.extraInstructions}` : "",
    input.context ? `Contexto do aluno (histórico/desempenho): ${input.context}` : "",
    "Use linguagem clara, objetiva e adequada a concurso.",
    "A justificativa deve explicar de forma didática por que a resposta correta está correta, considerando o enunciado que você reescreveu.",
    "Evite temas polêmicos ou desatualizados sem contexto.",
    'Estrutura da resposta: agrupe as questões em "groups" (cada group tem "supportText" e "questions"), um group por variação (supportText conforme a regra acima).',
    MATH_FORMATTING_INSTRUCTION
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateWithOpenAI(settings: Awaited<ReturnType<typeof getAiSettings>>, prompt: string) {
  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined
  });

  const response = await openai.responses.parse({
    model: settings.model,
    input: [
      {
        role: "system",
        content:
          "Você cria questões originais para concursos públicos e sempre retorna dados estruturados válidos."
      },
      { role: "user", content: prompt }
    ],
    text: {
      format: zodTextFormat(generatedQuestionSchema, "generated_questions")
    }
  });

  if (!response.output_parsed) {
    throw new Error("A IA não retornou uma estrutura válida.");
  }

  return normalizeGenerated({
    provider: AiProvider.OPENAI,
    model: settings.model,
    prompt,
    groups: response.output_parsed.groups
  });
}

async function generateWithClaude(settings: Awaited<ReturnType<typeof getAiSettings>>, prompt: string) {
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 4096,
      system:
        "Você cria questões originais para concursos públicos. Use a ferramenta emit_questions para retornar apenas dados estruturados.",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "emit_questions",
          description: "Retorna uma lista validada de questões de concurso.",
          input_schema: questionsJsonSchema
        }
      ],
      tool_choice: { type: "tool", name: "emit_questions" }
    })
  });

  const data = await readJsonResponse(response);
  const toolUse = data.content?.find((block: { type?: string; name?: string }) => block.type === "tool_use" && block.name === "emit_questions");
  const parsed = generatedQuestionSchema.parse(toolUse?.input);

  return normalizeGenerated({
    provider: AiProvider.CLAUDE,
    model: settings.model,
    prompt,
    groups: parsed.groups
  });
}

async function generateWithOpenRouter(settings: Awaited<ReturnType<typeof getAiSettings>>, prompt: string) {
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
        {
          role: "system",
          content:
            "Você cria questões originais para concursos públicos. Use a ferramenta emit_questions para retornar apenas dados estruturados."
        },
        { role: "user", content: prompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_questions",
            description: "Retorna uma lista validada de questões de concurso público.",
            parameters: questionsJsonSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "emit_questions" } }
    })
  });

  const data = await readJsonResponse(response);
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const rawArgs = toolCall?.function?.arguments;
  if (!rawArgs) throw new Error("O provedor não retornou uma chamada de ferramenta válida.");
  const parsed = generatedQuestionSchema.parse(JSON.parse(rawArgs));

  return normalizeGenerated({
    provider: AiProvider.OPENROUTER,
    model: settings.model,
    prompt,
    groups: parsed.groups
  });
}

function normalizeGenerated(result: {
  provider: AiProvider;
  model: string;
  prompt: string;
  groups: { supportText?: string | null; questions: z.infer<typeof generatedItemSchema>[] }[];
}) {
  // Achata os grupos em questões individuais, carregando o supportText do grupo em cada uma —
  // texto null/curto demais (placeholder inútil) vira null em vez de "quase vazio".
  const flattened: GeneratedQuestion[] = result.groups.flatMap((group) => {
    const supportText = group.supportText && group.supportText.trim().length >= 80 ? group.supportText.trim() : null;
    return group.questions.map((question) => ({ ...question, supportText }));
  });

  return {
    provider: result.provider,
    model: result.model,
    prompt: result.prompt,
    questions: flattened.map((question) => {
      if (question.format === "CERTO_ERRADO") {
        const answer = question.answer === "ERRADO" ? "ERRADO" : "CERTO";
        return {
          ...question,
          answer,
          options: [
            { label: "C", text: "Certo", isCorrect: answer === "CERTO" },
            { label: "E", text: "Errado", isCorrect: answer === "ERRADO" }
          ]
        };
      }

      const correctCount = question.options.filter((option) => option.isCorrect).length;
      if (correctCount !== 1) {
        throw new Error("A IA retornou questão de múltipla escolha sem exatamente uma alternativa correta.");
      }

      return {
        ...question,
        answer: null,
        options: question.options.map((option, index) => ({
          ...option,
          label: normalizeOptionLabel(option.label, index)
        }))
      };
    })
  };
}

function normalizeOptionLabel(label: string | undefined, index: number) {
  const fallback = String.fromCharCode(65 + index);
  if (!label) return fallback;
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const direct = normalized.match(/^[A-E]$/);
  if (direct) return direct[0];
  const embedded = normalized.match(/\b([A-E])\b/);
  return embedded?.[1] ?? fallback;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Provedor retornou resposta não-JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const message = data.error?.message ?? data.message ?? `Erro ${response.status} no provedor de IA.`;
    throw new Error(`[HTTP ${response.status}] ${message}`);
  }

  return data;
}

function clampAlternatives(value: number) {
  return Math.min(Math.max(Number(value) || 4, 2), 5);
}
