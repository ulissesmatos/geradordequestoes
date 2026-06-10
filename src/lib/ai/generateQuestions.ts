import { AiProvider, type Difficulty, type QuestionFormat, type QuestionSetMode } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";

const generatedQuestionSchema = z.object({
  questions: z.array(
    z.object({
      statement: z.string().min(20),
      format: z.enum(["CERTO_ERRADO", "MULTIPLA_ESCOLHA"]),
      answer: z.enum(["CERTO", "ERRADO"]).nullable().optional(),
      explanation: z.string().min(10),
      difficulty: z.enum(["FACIL", "MEDIO", "DIFICIL"]),
      options: z.array(
        z.object({
          label: z.string().min(1).max(24),
          text: z.string().min(1),
          isCorrect: z.boolean()
        })
      )
    })
  )
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>["questions"][number];

const questionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "format", "answer", "explanation", "difficulty", "options"],
        properties: {
          statement: { type: "string", minLength: 20 },
          format: { type: "string", enum: ["CERTO_ERRADO", "MULTIPLA_ESCOLHA"] },
          answer: { type: ["string", "null"], enum: ["CERTO", "ERRADO", null] },
          explanation: { type: "string", minLength: 10 },
          difficulty: { type: "string", enum: ["FACIL", "MEDIO", "DIFICIL"] },
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
}) {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(settings.provider)} no painel admin.`);
  }

  const format = input.format ?? "CERTO_ERRADO";
  const alternativesCount = clampAlternatives(input.alternativesCount ?? 4);
  const prompt = buildPrompt({ ...input, format, alternativesCount });

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
    input.prompt ? `Pedido do usuário: ${input.prompt}` : "",
    input.extraInstructions ? `Instruções adicionais: ${input.extraInstructions}` : "",
    input.context ? `Contexto de desempenho do aluno: ${input.context}` : "",
    "Gere questões originais de concurso público.",
    "Não copie questões reais, provas oficiais ou bancos pagos.",
    "Use linguagem clara, objetiva e adequada a concurso.",
    "A justificativa deve explicar de forma didática por que a resposta correta está correta.",
    "Evite temas polêmicos ou desatualizados sem contexto."
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
    questions: response.output_parsed.questions
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
    questions: parsed.questions
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
    questions: parsed.questions
  });
}

function normalizeGenerated(result: {
  provider: AiProvider;
  model: string;
  prompt: string;
  questions: GeneratedQuestion[];
}) {
  return {
    ...result,
    questions: result.questions.map((question) => {
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
