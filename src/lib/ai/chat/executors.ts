import {
  AiUsageEventType,
  Difficulty,
  QuestionFormat,
  QuestionSetMode,
  type Role
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateStudyMaterial } from "@/lib/ai/generateStudyMaterial";
import { reviewDefaults, runStudyTool } from "@/lib/ai/study-tools";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import { difficultyLabel, questionFormatLabel, questionSetModeLabel } from "@/lib/labels";
import { inferMaterialTaxonomy, materialTitleFromPrompt } from "@/lib/materials";
import { buildQuestionSetTitle, generateAndSaveQuestionSet } from "@/lib/question-sets";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";
import { getPerformanceContext, getRecentAttachmentText, getRecentConversationText } from "@/lib/ai/chat/context";
import { chatTools, isChatToolName } from "@/lib/ai/chat/tools";
import { searchReferenceChunks } from "@/lib/reference";
import { webSearch } from "@/lib/ai/web-search";

export type ToolSource = { title: string; url: string };

export type ToolExecutionResult = {
  resultForModel: string;
  questionSetId?: string;
  studyMaterialId?: string;
  /** Confirmação determinística usada se o modelo não redigir a resposta final. */
  fallbackMessage?: string;
  /** Fontes externas consultadas (busca web) — viram ícones de link na resposta. */
  sources?: ToolSource[];
};

type ToolUser = { id: string; role: Role };

export async function executeToolCall(input: {
  user: ToolUser;
  sessionId: string;
  userPrompt: string;
  name: string;
  argumentsJson: string;
}): Promise<ToolExecutionResult> {
  if (!isChatToolName(input.name)) {
    return errorResult(`Ferramenta desconhecida: ${input.name}.`);
  }

  let rawArgs: unknown;
  try {
    rawArgs = input.argumentsJson ? JSON.parse(input.argumentsJson) : {};
  } catch {
    return errorResult("Os argumentos enviados não são um JSON válido. Tente novamente com argumentos corretos.");
  }

  try {
    switch (input.name) {
      case "generate_questions":
        return await runGenerateQuestions(input.user, input.sessionId, input.userPrompt, rawArgs);
      case "generate_study_material":
        return await runGenerateStudyMaterial(input.user, input.sessionId, rawArgs);
      case "get_performance":
        return await runGetPerformance(input.user, rawArgs);
      case "get_study_history":
        return await runGetStudyHistory(input.user, rawArgs);
      case "generate_review_from_mistakes":
        return await runGenerateReview(input.user, input.sessionId, input.userPrompt, rawArgs);
      case "search_reference_material":
        return await runSearchReference(rawArgs);
      case "web_search":
        return await runWebSearch(rawArgs);
    }
  } catch (error) {
    return errorResult(
      `${error instanceof Error ? error.message : "Erro desconhecido ao executar a ferramenta."} Explique a situação ao usuário de forma direta.`
    );
  }
}

function errorResult(message: string): ToolExecutionResult {
  return { resultForModel: JSON.stringify({ error: message }) };
}

function parseArgs<T extends z.ZodType>(schema: T, rawArgs: unknown): { ok: true; args: z.infer<T> } | { ok: false; result: ToolExecutionResult } {
  const parsed = schema.safeParse(rawArgs);
  if (parsed.success) return { ok: true, args: parsed.data };
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "args"}: ${issue.message}`).join("; ");
  return { ok: false, result: errorResult(`Argumentos inválidos (${issues}). Corrija e tente novamente.`) };
}

async function runGenerateQuestions(user: ToolUser, sessionId: string, userPrompt: string, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.generate_questions.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const subjects = await prisma.subject.findMany({
    include: { topics: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });
  if (subjects.length === 0) {
    return errorResult("Não há matérias cadastradas no sistema. Explique que o administrador precisa cadastrar matérias e assuntos antes de gerar questões.");
  }

  const subject = matchByName(subjects, args.subjectName);
  if (!subject) {
    return errorResult(
      `Matéria "${args.subjectName}" não encontrada. Matérias disponíveis: ${subjects.map((item) => item.name).join(", ")}. Pergunte ao usuário qual delas usar.`
    );
  }
  if (subject.topics.length === 0) {
    return errorResult(`A matéria ${subject.name} ainda não tem assuntos cadastrados. Sugira outra matéria ao usuário.`);
  }
  const topic = (args.topicName ? matchByName(subject.topics, args.topicName) : null) ?? subject.topics[0];
  // If the AI requested a topic that doesn't match a DB topic, preserve its label in the title
  const displayTopicName = args.topicName || topic.name;

  await assertCanGenerateWithAi(user);

  const [recentContext, attachmentText, performanceContext] = await Promise.all([
    getRecentConversationText(sessionId),
    getRecentAttachmentText(sessionId),
    getPerformanceContext(user.id)
  ]);
  const context = [
    attachmentText ? `Material enviado pelo usuário (use como base das questões quando fizer sentido):\n${attachmentText}` : "",
    recentContext,
    performanceContext
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);

  const format = args.format as QuestionFormat;
  const mode = args.mode as QuestionSetMode;
  const difficulty = args.difficulty as Difficulty;
  const alternativesCount = format === QuestionFormat.MULTIPLA_ESCOLHA ? args.alternativesCount ?? 4 : 2;

  const questionSet = await generateAndSaveQuestionSet({
    user,
    subjectId: subject.id,
    topicId: topic.id,
    difficulty,
    quantity: args.quantity,
    format,
    alternativesCount,
    mode,
    title: buildQuestionSetTitle(mode, subject.name, displayTopicName),
    prompt: userPrompt,
    chatSessionId: sessionId,
    context
  });

  return {
    questionSetId: questionSet.id,
    resultForModel: JSON.stringify({
      ok: true,
      title: questionSet.title,
      quantity: questionSet.quantity,
      subject: subject.name,
      topic: topic.name,
      mode: questionSetModeLabel(mode),
      format: questionFormatLabel(format),
      difficulty: difficultyLabel(difficulty),
      note: "Bloco salvo na biblioteca do usuário. O app mostra o botão 'Responder agora' automaticamente; não invente links."
    }),
    fallbackMessage: buildGenerationFallback({
      quantity: questionSet.quantity,
      format,
      mode,
      difficulty,
      subjectName: subject.name,
      topicName: topic.name
    })
  };
}

async function runGenerateStudyMaterial(user: ToolUser, sessionId: string, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.generate_study_material.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  await assertCanGenerateWithAi(user);

  const materialPrompt = [args.topic, args.focus].filter(Boolean).join(" — ");
  const [recentContext, performanceContext] = await Promise.all([
    getRecentConversationText(sessionId),
    getPerformanceContext(user.id)
  ]);
  const context = [recentContext, performanceContext].filter(Boolean).join("\n\n").slice(0, 5200);

  const generated = await generateStudyMaterial({ prompt: materialPrompt, context });
  await recordAiUsageEvent({
    user,
    type: AiUsageEventType.CHAT_RESPONSE,
    model: generated.model,
    prompt: `study-material: ${materialPrompt}`
  });

  const taxonomy = await inferMaterialTaxonomy(materialPrompt);
  const material = await prisma.studyMaterial.create({
    data: {
      userId: user.id,
      subjectId: taxonomy.subject?.id,
      topicId: taxonomy.topic?.id,
      title: materialTitleFromPrompt(materialPrompt),
      prompt: materialPrompt,
      content: generated.content,
      aiModel: generated.model
    }
  });

  return {
    studyMaterialId: material.id,
    resultForModel: JSON.stringify({
      ok: true,
      title: material.title,
      note: "Material salvo na área de Materiais do usuário. O app mostra o botão 'Abrir material' automaticamente; não invente links."
    }),
    fallbackMessage: [
      "Pronto. Criei um material de estudo e salvei na sua área de Materiais.",
      "",
      `Título: **${material.title}**.`,
      "",
      "Você pode ler no site, baixar em PDF e depois pedir questões baseadas nele."
    ].join("\n")
  };
}

async function runGetPerformance(user: ToolUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.get_performance.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const result = await runStudyTool({
    userId: user.id,
    prompt: args.subjectName ?? "",
    toolName: args.scope === "worst_subject" ? "WORST_SUBJECT" : "SUBJECT_PERFORMANCE"
  });
  return { resultForModel: result.kind === "message" ? result.message : "Sem dados de desempenho." };
}

async function runGetStudyHistory(user: ToolUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.get_study_history.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const toolName =
    args.kind === "most_missed" ? "MOST_MISSED_QUESTIONS" : args.kind === "recent_correct" ? "RECENT_CORRECT_ANSWERS" : "FAVORITE_QUESTIONS";
  const result = await runStudyTool({
    userId: user.id,
    prompt: args.subjectName ?? "",
    toolName
  });
  return { resultForModel: result.kind === "message" ? result.message : "Sem dados de histórico." };
}

async function runGenerateReview(user: ToolUser, sessionId: string, userPrompt: string, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.generate_review_from_mistakes.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const target = await runStudyTool({
    userId: user.id,
    prompt: args.subjectName ?? "",
    toolName: "GENERATE_REVIEW_FROM_MISTAKES"
  });
  if (target.kind === "message") {
    return { resultForModel: target.message };
  }

  await assertCanGenerateWithAi(user);

  const defaults = reviewDefaults();
  const format = (args.format as QuestionFormat | undefined) ?? defaults.format;
  const questionSet = await generateAndSaveQuestionSet({
    user,
    subjectId: target.subjectId,
    topicId: target.topicId,
    difficulty: defaults.difficulty,
    quantity: args.quantity ?? defaults.quantity,
    format,
    alternativesCount: format === QuestionFormat.MULTIPLA_ESCOLHA ? 4 : defaults.alternativesCount,
    mode: QuestionSetMode.REVISAO,
    title: target.title,
    prompt: userPrompt,
    chatSessionId: sessionId,
    context: [await getRecentConversationText(sessionId), target.context].filter(Boolean).join("\n\n").slice(0, 5200)
  });

  return {
    questionSetId: questionSet.id,
    resultForModel: JSON.stringify({
      ok: true,
      title: questionSet.title,
      quantity: questionSet.quantity,
      focus: `${target.subjectName} / ${target.topicName}`,
      note: "Bloco de revisão salvo na biblioteca. O app mostra o botão 'Responder agora' automaticamente; não invente links."
    }),
    fallbackMessage: [
      "Boa. Gerei uma revisão personalizada usando seus erros recentes.",
      "",
      `Foco principal: **${target.subjectName} / ${target.topicName}**.`,
      `O bloco ficou salvo no seu histórico com ${questionSet.quantity} questões. Você pode responder agora ou voltar nele depois.`
    ].join("\n")
  };
}

async function runSearchReference(rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.search_reference_material.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  // Resolve matéria/assunto pelos nomes, se informados.
  let subjectId: string | null = null;
  let topicId: string | null = null;
  if (args.subjectName) {
    const subjects = await prisma.subject.findMany({ include: { topics: true } });
    const subject = matchByName(subjects, args.subjectName);
    if (subject) {
      subjectId = subject.id;
      if (args.topicName) topicId = matchByName(subject.topics, args.topicName)?.id ?? null;
    }
  }

  const hits = await searchReferenceChunks({ query: args.query, subjectId, topicId, limit: args.limit ?? 5 });
  if (hits.length === 0) {
    return {
      resultForModel: JSON.stringify({
        ok: true,
        results: [],
        note: "Nenhum material de referência encontrado para esses termos. Responda com seu conhecimento, deixando claro que não há material interno sobre isso."
      })
    };
  }
  return {
    resultForModel: JSON.stringify({
      ok: true,
      results: hits.map((h) => ({ title: h.title, source: h.source, excerpt: h.content.slice(0, 700) })),
      note: "Use estes trechos reais para fundamentar a resposta e conferir o gabarito. Cite a fonte (título) ao usuário."
    })
  };
}

async function runWebSearch(rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.web_search.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const outcome = await webSearch(args.query, args.maxResults ?? 6);
  if (!outcome.ok) {
    return {
      resultForModel: JSON.stringify({
        ok: false,
        reason: outcome.reason,
        note: "A busca na web não está disponível agora. Responda com seu conhecimento e avise que não foi possível buscar dados recentes."
      })
    };
  }
  return {
    resultForModel: JSON.stringify({
      ok: true,
      results: outcome.results,
      note: "Resultados da web. NÃO escreva uma seção de 'Fontes' nem cole URLs no texto — o app exibe automaticamente os links consultados como ícones ao final da resposta. Use as informações e priorize as fontes mais confiáveis."
    }),
    sources: outcome.results.filter((r) => r.url).map((r) => ({ title: r.title || r.url, url: r.url }))
  };
}

function buildGenerationFallback(input: {
  quantity: number;
  format: QuestionFormat;
  mode: QuestionSetMode;
  difficulty: Difficulty;
  subjectName: string;
  topicName: string;
}) {
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "bloco de estudo",
    [QuestionSetMode.SIMULADO]: "simulado",
    [QuestionSetMode.REVISAO]: "bloco de revisão"
  }[input.mode];
  return `Boa. Preparei um ${modeLabel} com ${input.quantity} questões de ${input.subjectName}, em ${questionFormatLabel(input.format)}, no nível ${difficultyLabel(input.difficulty).toLowerCase()}. Usei ${input.topicName} como eixo do bloco e deixei as justificativas prontas para você revisar depois da resposta. O bloco já está salvo no seu histórico. Quando quiser, é só começar por "Responder agora".`;
}

function matchByName<T extends { name: string }>(items: T[], query: string): T | null {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;
  return (
    items.find((item) => normalizeText(item.name) === normalizedQuery) ??
    items.find((item) => normalizeText(item.name).includes(normalizedQuery) || normalizedQuery.includes(normalizeText(item.name))) ??
    null
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
