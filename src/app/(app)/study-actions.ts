"use server";

import { AiChatPresetUsageLevel, AiChatRole, AiUsageEventStatus, AiUsageEventType, Difficulty, QuestionAnswer, QuestionFormat, QuestionSetMode, QuestionStatus, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/guards";
import { generateChatReply } from "@/lib/ai/generateChatReply";
import { routeStudyToolWithAi } from "@/lib/ai/routeStudyTool";
import { getAiSettings } from "@/lib/ai/settings";
import {
  getUserStudySnapshot,
  looksLikeStudyToolRequest,
  matchDeterministicStudyTool,
  reviewDefaults,
  runStudyTool,
  type StudyToolName
} from "@/lib/ai/study-tools";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";
import { generateAndSaveQuestionSet } from "@/lib/question-sets";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

const attemptSchema = z.object({
  questionId: z.string(),
  userAnswer: z.nativeEnum(QuestionAnswer).optional(),
  selectedOptionId: z.string().optional(),
  userAnswerText: z.string().optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(36000).default(0)
});

type ChatActionState = {
  ok?: boolean;
  questionSetId?: string;
  sessionId?: string;
  messageId?: string;
  message?: string;
  suggestions?: string[];
  error?: string;
};

export async function answerQuestionAction(formData: FormData) {
  const user = await requireUser();
  const parsed = attemptSchema.parse({
    questionId: formData.get("questionId"),
    userAnswer: formData.get("userAnswer") || undefined,
    selectedOptionId: formData.get("selectedOptionId") || undefined,
    userAnswerText: formData.get("userAnswerText") || undefined,
    timeSpentSeconds: formData.get("timeSpentSeconds") ?? 0
  });

  const question = await prisma.question.findFirst({
    where: {
      id: parsed.questionId,
      OR: [{ status: QuestionStatus.APPROVED }, { createdById: user.id }]
    },
    include: { options: true }
  });
  if (!question) throw new Error("Questão não encontrada ou indisponível.");

  const selectedOption = parsed.selectedOptionId
    ? question.options.find((option) => option.id === parsed.selectedOptionId)
    : undefined;
  const isCorrect = selectedOption
    ? selectedOption.isCorrect
    : parsed.userAnswer
      ? parsed.userAnswer === question.answer
      : false;

  await prisma.questionAttempt.create({
    data: {
      userId: user.id,
      questionId: question.id,
      userAnswer: parsed.userAnswer,
      selectedOptionId: selectedOption?.id,
      userAnswerText: parsed.userAnswerText ?? selectedOption?.label ?? parsed.userAnswer,
      isCorrect,
      timeSpentSeconds: parsed.timeSpentSeconds
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/revisao");
  revalidatePath("/questoes/estudar");
}

export async function generateUserQuestionsAction(
  _: { ok?: boolean; questionSetId?: string; error?: string } | null,
  formData: FormData
) {
  const user = await requireUser();
  const subjectId = String(formData.get("subjectId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");
  const difficulty = formData.get("difficulty") as Difficulty;
  const quantity = Math.min(Number(formData.get("quantity") ?? 5), 15);
  const format = (formData.get("format") as QuestionFormat) || QuestionFormat.CERTO_ERRADO;
  const alternativesCount = Math.min(Math.max(Number(formData.get("alternativesCount") ?? 4), 2), 5);
  const mode = (formData.get("mode") as QuestionSetMode) || QuestionSetMode.ESTUDO;
  const prompt = String(formData.get("prompt") || formData.get("extraInstructions") || "");
  const title = String(formData.get("title") || "");
  const context = String(formData.get("context") || "");

  try {
    await assertCanGenerateWithAi(user);
    const questionSet = await generateAndSaveQuestionSet({
      user,
      subjectId,
      topicId,
      difficulty,
      quantity,
      format,
      alternativesCount,
      mode,
      prompt,
      title: title || undefined,
      context: context || undefined
    });
    revalidatePath("/questoes/gerar");
    revalidatePath("/questoes/estudar");
    revalidatePath("/dashboard");
    return { ok: true, questionSetId: questionSet.id };
  } catch (error) {
    await prisma.aiGenerationLog
      .create({
        data: {
          adminId: user.id,
          subjectId,
          topicId,
          difficulty,
          quantity,
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          prompt,
          status: "USER_ERROR",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
        }
      })
      .catch(() => undefined);

    return { error: error instanceof Error ? error.message : "Erro ao gerar questões." };
  }
}

export async function generateChatQuestionSetAction(
  _: ChatActionState | null,
  formData: FormData
): Promise<ChatActionState> {
  const user = await requireUser();
  const prompt = String(formData.get("prompt") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  try {
    const session = await getOrCreateChatSession(user.id, prompt, sessionId || undefined);
    const previousMessages = await getRecentChatMessages(session.id);
    await prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: AiChatRole.USER, content: prompt }
    });
    const resolvedPrompt = resolvePromptWithConversation(prompt, previousMessages);
    const studyToolPrompt = resolveStudyToolPromptWithConversation(prompt, previousMessages);
    if (resolvedPrompt !== prompt && previousMessages.length <= 2) {
      await prisma.aiChatSession.update({
        where: { id: session.id },
        data: { title: titleFromPrompt(resolvedPrompt) }
      });
    }
    const settings = await getAiSettings();
    const presetLevel = settings.chatPresetUsageLevel;

    const safeReply = buildSafetyReply(prompt);
    if (safeReply) {
      const assistant = await createAssistantMessage(session.id, safeReply);
      revalidatePath("/dashboard");
      return { ok: true, sessionId: session.id, messageId: assistant.id, message: safeReply };
    }

    const directReply = buildDirectConversationalReply(prompt, previousMessages);
    if (directReply && shouldUseLocalDirectReply(presetLevel)) {
      const assistant = await createAssistantMessage(session.id, directReply);
      revalidatePath("/dashboard");
      return { ok: true, sessionId: session.id, messageId: assistant.id, message: directReply };
    }

    const deterministicTool = matchDeterministicStudyTool(studyToolPrompt);
    if (deterministicTool) {
      const toolResponse = await handleStudyTool({
        user,
        sessionId: session.id,
        prompt: studyToolPrompt,
        toolName: deterministicTool,
        formData
      });
      revalidatePath("/dashboard");
      revalidatePath("/questoes/estudar");
      return toolResponse;
    }

    if (!looksLikeQuestionGeneration(studyToolPrompt) && looksLikeStudyToolRequest(studyToolPrompt)) {
      const routedTool = await routeStudyToolForUser({
        user,
        prompt: studyToolPrompt,
        context: await getChatContextForUser(session.id, user.id)
      });
      if (routedTool) {
        const toolResponse = await handleStudyTool({
          user,
          sessionId: session.id,
          prompt: studyToolPrompt,
          toolName: routedTool,
          formData
        });
        revalidatePath("/dashboard");
        revalidatePath("/questoes/estudar");
        return toolResponse;
      }
    }

    const suggestions = buildClarifyingSuggestions(resolvedPrompt);
    if (suggestions.length > 0 && shouldAskGenerationClarification(resolvedPrompt, presetLevel)) {
      const reply = "Consigo gerar pelo sistema do site, mas preciso de só mais um ponto de direção para salvar o bloco corretamente. Use uma sugestão acima ou me diga a matéria/assunto.";
      const assistant = await createAssistantMessage(session.id, reply);
      revalidatePath("/dashboard");
      return { ok: true, sessionId: session.id, messageId: assistant.id, message: reply, suggestions };
    }

    if (!looksLikeQuestionGeneration(resolvedPrompt)) {
      if (shouldUseLocalFallback(presetLevel)) {
        const reply = buildConversationalReply(prompt, previousMessages);
        const assistant = await createAssistantMessage(session.id, reply);
        revalidatePath("/dashboard");
        return { ok: true, sessionId: session.id, messageId: assistant.id, message: reply };
      }

      const assistant = await createLlmAssistantMessage({
        user,
        sessionId: session.id,
        prompt,
        context: await getChatContextForUser(session.id, user.id)
      });
      revalidatePath("/dashboard");
      return { ok: true, sessionId: session.id, messageId: assistant.id, message: assistant.content };
    }

    if (suggestions.length > 0) {
      const reply = "Para gerar questões eu uso o gerador do próprio site, salvando tudo no seu histórico. Me diga a matéria/assunto ou use uma das sugestões para eu criar o bloco do jeito certo.";
      const assistant = await createAssistantMessage(session.id, reply);
      revalidatePath("/dashboard");
      return { ok: true, sessionId: session.id, messageId: assistant.id, message: reply, suggestions };
    }

    await assertCanGenerateWithAi(user);
    const inferred = await inferGenerationConfig(resolvedPrompt, formData);
    const [recentContext, performanceContext] = await Promise.all([
      getRecentConversationContext(session.id),
      getPerformanceContext(user.id)
    ]);
    const context = [recentContext, performanceContext].filter(Boolean).join("\n\n").slice(0, 5200);

    const questionSet = await generateAndSaveQuestionSet({
      user,
      subjectId: inferred.subjectId,
      topicId: inferred.topicId,
      difficulty: inferred.difficulty,
      quantity: inferred.quantity,
      format: inferred.format,
      alternativesCount: inferred.alternativesCount,
      mode: inferred.mode,
      prompt: resolvedPrompt,
      chatSessionId: session.id,
      context
    });

    const assistantMessage = buildGenerationReply({
      quantity: questionSet.quantity,
      format: questionSet.format,
      mode: questionSet.mode,
      difficulty: questionSet.difficulty,
      subjectName: inferred.subjectName,
      topicName: inferred.topicName
    });
    const assistant = await prisma.aiChatMessage.create({
      data: { sessionId: session.id, questionSetId: questionSet.id, role: AiChatRole.ASSISTANT, content: assistantMessage }
    });

    revalidatePath("/dashboard");
    revalidatePath("/questoes/estudar");
    return { ok: true, questionSetId: questionSet.id, sessionId: session.id, messageId: assistant.id, message: assistantMessage };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao gerar questões." };
  }
}

export async function renameChatSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!title) return;

  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: { title }
  });
  revalidatePath("/dashboard");
}

export async function deleteChatSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  const isActive = formData.get("isActive") === "true";

  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true }
  });
  if (!session) return;

  await prisma.$transaction([
    prisma.questionSet.updateMany({
      where: { chatSessionId: session.id, userId: user.id },
      data: { chatSessionId: null }
    }),
    prisma.aiChatSession.delete({
      where: { id: session.id }
    })
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/questoes/estudar");

  if (isActive) redirect("/dashboard?new=1");
}

async function inferGenerationConfig(prompt: string, formData: FormData) {
  const subjects = await prisma.subject.findMany({
    include: { topics: true },
    orderBy: { name: "asc" }
  });
  const normalizedPrompt = normalizeText(prompt);

  const explicitSubjectId = String(formData.get("subjectId") ?? "");
  const explicitTopicId = String(formData.get("topicId") ?? "");
  const subject =
    subjects.find((item) => item.id === explicitSubjectId) ??
    subjects.find((item) => normalizedPrompt.includes(normalizeText(item.name))) ??
    subjects[0];
  const topic =
    subject?.topics.find((item) => item.id === explicitTopicId) ??
    subject?.topics.find((item) => normalizedPrompt.includes(normalizeText(item.name))) ??
    subject?.topics[0];

  if (!subject || !topic) {
    throw new Error("Cadastre pelo menos uma matéria e um assunto antes de gerar questões.");
  }

  const format = inferFormat(normalizedPrompt, formData);
  return {
    subjectId: subject.id,
    topicId: topic.id,
    subjectName: subject.name,
    topicName: topic.name,
    mode: inferMode(normalizedPrompt, formData),
    format,
    alternativesCount: format === QuestionFormat.MULTIPLA_ESCOLHA ? inferAlternativesCount(normalizedPrompt, formData) : 2,
    difficulty: inferDifficulty(normalizedPrompt, formData),
    quantity: inferQuantity(normalizedPrompt, formData)
  };
}

async function createAssistantMessage(sessionId: string, content: string) {
  return prisma.aiChatMessage.create({
    data: { sessionId, role: AiChatRole.ASSISTANT, content }
  });
}

async function createLlmAssistantMessage(input: {
  user: { id: string; role?: Role };
  sessionId: string;
  prompt: string;
  context?: string;
}) {
  await assertCanGenerateWithAi(input.user);
  try {
    const generated = await generateChatReply({
      prompt: input.prompt,
      context: input.context
    });
    await recordAiUsageEvent({
      user: input.user,
      type: AiUsageEventType.CHAT_RESPONSE,
      model: generated.model,
      prompt: input.prompt
    });
    return createAssistantMessage(input.sessionId, generated.message);
  } catch (error) {
    await recordAiUsageEvent({
      user: input.user,
      type: AiUsageEventType.CHAT_RESPONSE,
      status: AiUsageEventStatus.ERROR,
      prompt: input.prompt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
    }).catch(() => undefined);
    throw error;
  }
}

async function routeStudyToolForUser(input: {
  user: { id: string; role?: Role };
  prompt: string;
  context?: string;
}) {
  try {
    await assertCanGenerateWithAi(input.user);
    const routed = await routeStudyToolWithAi({
      prompt: input.prompt,
      context: input.context
    });
    await recordAiUsageEvent({
      user: input.user,
      type: AiUsageEventType.CHAT_RESPONSE,
      model: routed.model,
      prompt: `tool-router: ${input.prompt}`
    });
    return routed.toolName;
  } catch (error) {
    await recordAiUsageEvent({
      user: input.user,
      type: AiUsageEventType.CHAT_RESPONSE,
      status: AiUsageEventStatus.ERROR,
      prompt: `tool-router: ${input.prompt}`,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
    }).catch(() => undefined);
    return null;
  }
}

async function handleStudyTool(input: {
  user: { id: string; role: Role };
  sessionId: string;
  prompt: string;
  toolName: StudyToolName;
  formData: FormData;
}) {
  const result = await runStudyTool({
    userId: input.user.id,
    prompt: input.prompt,
    toolName: input.toolName
  });

  if (result.kind === "message") {
    const assistant = await createAssistantMessage(input.sessionId, result.message);
    return { ok: true, sessionId: input.sessionId, messageId: assistant.id, message: result.message };
  }

  await assertCanGenerateWithAi(input.user);
  const normalizedPrompt = normalizeText(input.prompt);
  const defaults = reviewDefaults();
  const format = inferFormat(normalizedPrompt, input.formData);
  const questionSet = await generateAndSaveQuestionSet({
    user: input.user,
    subjectId: result.subjectId,
    topicId: result.topicId,
    difficulty: inferDifficulty(normalizedPrompt, input.formData) || defaults.difficulty,
    quantity: inferQuantity(normalizedPrompt, input.formData) || defaults.quantity,
    format,
    alternativesCount: format === QuestionFormat.MULTIPLA_ESCOLHA ? inferAlternativesCount(normalizedPrompt, input.formData) : defaults.alternativesCount,
    mode: QuestionSetMode.REVISAO,
    title: result.title,
    prompt: input.prompt,
    chatSessionId: input.sessionId,
    context: [await getRecentConversationContext(input.sessionId), result.context].filter(Boolean).join("\n\n").slice(0, 5200)
  });

  const assistantMessage = [
    "Boa. Gerei uma revisão personalizada usando seus erros recentes.",
    "",
    `Foco principal: **${result.subjectName} / ${result.topicName}**.`,
    `O bloco ficou salvo no seu histórico com ${questionSet.quantity} questões. Você pode responder agora ou voltar nele depois.`
  ].join("\n");
  const assistant = await prisma.aiChatMessage.create({
    data: { sessionId: input.sessionId, questionSetId: questionSet.id, role: AiChatRole.ASSISTANT, content: assistantMessage }
  });

  return {
    ok: true,
    questionSetId: questionSet.id,
    sessionId: input.sessionId,
    messageId: assistant.id,
    message: assistantMessage
  };
}

async function getChatContextForUser(sessionId: string, userId: string) {
  const [conversation, snapshot] = await Promise.all([getRecentConversationContext(sessionId), getUserStudySnapshot(userId)]);
  return [conversation ? `Conversa atual:\n${conversation}` : "", snapshot].filter(Boolean).join("\n\n").slice(0, 5200);
}

async function getRecentConversationContext(sessionId: string) {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  return messages
    .reverse()
    .map((message) => `${message.role === AiChatRole.USER ? "Usuário" : "Assistente"}: ${message.content}`)
    .join("\n")
    .slice(0, 3500);
}

async function getRecentChatMessages(sessionId: string) {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 14,
    select: { role: true, content: true }
  });
  return messages.reverse();
}

async function getPerformanceContext(userId: string) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: {
      question: {
        include: {
          subject: true,
          topic: true
        }
      }
    }
  });

  if (attempts.length === 0) return "";

  const errors = attempts
    .filter((attempt) => !attempt.isCorrect)
    .slice(0, 6)
    .map((attempt) => `${attempt.question.subject.name} / ${attempt.question.topic.name}: ${attempt.question.statement.slice(0, 180)}`);
  const hits = attempts
    .filter((attempt) => attempt.isCorrect)
    .slice(0, 4)
    .map((attempt) => `${attempt.question.subject.name} / ${attempt.question.topic.name}: ${attempt.question.statement.slice(0, 140)}`);

  return [
    "Use o histórico abaixo apenas como referência pedagógica para criar questões novas e originais; não copie enunciados.",
    errors.length ? `Erros recentes do aluno:\n- ${errors.join("\n- ")}` : "",
    hits.length ? `Acertos recentes do aluno:\n- ${hits.join("\n- ")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1700);
}

function resolvePromptWithConversation(
  prompt: string,
  previousMessages: Array<{ role: AiChatRole; content: string }>
) {
  const clean = prompt.trim();
  if (!clean) return clean;
  if (isMetaConversation(clean)) return clean;
  if (looksLikeStudyToolRequest(clean)) return clean;

  if (looksLikeQuestionGeneration(clean) && looksLikeContextReference(clean)) {
    const contextArea = extractStudyAreaFromMessages(previousMessages);
    if (contextArea) return `${clean}\nÁrea de referência do contexto: ${contextArea}`;
  }

  if (looksLikeQuestionGeneration(clean)) return clean;

  const lastUserGeneration = [...previousMessages]
    .reverse()
    .find((message) => message.role === AiChatRole.USER && looksLikeQuestionGeneration(message.content));
  if (!lastUserGeneration) return clean;

  const lastAssistantClarified = [...previousMessages]
    .reverse()
    .find((message) => message.role === AiChatRole.ASSISTANT && normalizeText(message.content).includes("direcao"));

  if (!lastAssistantClarified && !looksLikeContextualFollowUp(clean)) return clean;

  return `${lastUserGeneration.content}\nComplemento do usuário: ${clean}`;
}

function resolveStudyToolPromptWithConversation(
  prompt: string,
  previousMessages: Array<{ role: AiChatRole; content: string }>
) {
  const clean = prompt.trim();
  if (!clean) return clean;
  if (!looksLikeStudyToolRequest(clean)) return clean;
  if (hasKnownSubject(normalizeText(clean))) return clean;

  const contextArea = extractStudyAreaFromMessages(previousMessages);
  return contextArea ? `${clean}\nÁrea de referência do contexto: ${contextArea}` : clean;
}

function looksLikeContextReference(prompt: string) {
  const normalized = normalizeText(prompt);
  return [
    "nessa area",
    "nessa área",
    "dessa area",
    "dessa área",
    "nessa materia",
    "nessa matéria",
    "dessa materia",
    "dessa matéria",
    "nesse assunto",
    "desse assunto",
    "nesse tema",
    "desse tema",
    "com base nisso",
    "nesses erros",
    "desses erros"
  ].some((term) => normalized.includes(term));
}

function extractStudyAreaFromMessages(previousMessages: Array<{ role: AiChatRole; content: string }>) {
  const subjectTerms = [
    "Português",
    "Matemática",
    "Informática",
    "História",
    "Geografia",
    "Direito",
    "Administrativo",
    "Constitucional",
    "Raciocínio",
    "Atualidades",
    "Biologia",
    "Física",
    "Química",
    "Redação"
  ];

  for (const message of [...previousMessages].reverse()) {
    const content = message.content.replace(/\s+/g, " ");
    for (const subject of subjectTerms) {
      if (!normalizeText(content).includes(normalizeText(subject))) continue;

      const subjectTopicPattern = new RegExp(`(${subject})\\s*\\/\\s*([^\\n.;,)]+)`, "i");
      const subjectTopicMatch = content.match(subjectTopicPattern);
      if (subjectTopicMatch?.[1] && subjectTopicMatch?.[2]) {
        return `${subjectTopicMatch[1]} / ${subjectTopicMatch[2].trim()}`;
      }

      return subject;
    }
  }

  return null;
}

function looksLikeQuestionGeneration(prompt: string) {
  const normalized = normalizeText(prompt);
  if (isMetaConversation(normalized)) return false;
  const hasQuestionNoun = /\b(questao|questoes|pergunta|perguntas|item|itens|exercicio|exercicios)\b/.test(normalized);
  const hasQuantity = /\d{1,2}\s*(questoes|itens|perguntas|exercicios)/.test(normalized);
  const hasGenerationCommand = /\b(gere|gerar|crie|criar|monte|elabore|faca|fazer|faça)\b/.test(normalized);
  const hasExamMode = /\b(simulado|revisao|revisar|prova)\b/.test(normalized);
  const hasFormat = normalized.includes("alternativas") || normalized.includes("certo errado") || normalized.includes("multipla escolha");
  const hasSubject = hasKnownSubject(normalized);

  if (hasGenerationCommand && (hasQuestionNoun || hasExamMode || hasFormat)) return true;
  if (hasQuantity && (hasGenerationCommand || hasFormat || hasExamMode)) return true;
  if (hasExamMode && (hasQuestionNoun || hasFormat || hasGenerationCommand || hasSubject || normalized.includes("erros"))) return true;
  if (hasFormat && (hasSubject || hasQuestionNoun || hasQuantity)) return true;
  return false;
}

function buildClarifyingSuggestions(prompt: string) {
  const normalized = normalizeText(prompt);
  if (!looksLikeQuestionGeneration(prompt)) return [];
  const hasSubject = hasKnownSubject(normalized);
  const hasQuantity = /\d{1,2}\s*(questoes|itens|perguntas|exercicios)/.test(normalized);
  const tooShort = normalized.trim().split(/\s+/).length <= 3;

  if (hasSubject && !tooShort) return [];

  const suggestions: string[] = [];
  if (!hasSubject) {
    const quantity = hasQuantity ? inferQuantity(normalized, new FormData()) : 10;
    suggestions.push(`Gerar ${quantity} questões de Informática básica em Certo/Errado`);
    suggestions.push(`Gerar ${quantity} questões de Português com 4 alternativas`);
    suggestions.push("Gerar um simulado de Geografia com 5 alternativas no nível difícil");
  } else if (tooShort) {
    suggestions.push("Gerar 10 questões desse assunto em Certo/Errado");
    suggestions.push("Gerar 8 questões desse assunto com 4 alternativas");
  }

  return suggestions.slice(0, 3);
}

function shouldAskGenerationClarification(prompt: string, level: AiChatPresetUsageLevel) {
  return looksLikeQuestionGeneration(prompt) || shouldUseLocalClarification(level);
}

function buildSafetyReply(prompt: string) {
  const normalized = normalizeText(prompt);
  const sensitive = ["api key", "apikey", "chave da api", "openai_api_key", "prompt interno", "system prompt", "regras internas", "segredo", "token secreto"];
  if (!sensitive.some((term) => normalized.includes(term))) return null;
  return "Não posso revelar chaves, tokens, prompts internos ou regras privadas do sistema. Posso, porém, te ajudar a configurar provedores de IA no painel admin ou gerar questões de concurso com segurança.";
}

function buildDirectConversationalReply(prompt: string, previousMessages: Array<{ role: AiChatRole; content: string }>) {
  const normalized = normalizeText(prompt);

  if (
    normalized.includes("quem e voce") ||
    normalized.includes("quem é voce") ||
    normalized.includes("quem é você") ||
    normalized.includes("qual a sua versao") ||
    normalized.includes("versao do chatgpt")
  ) {
    return [
      "Sou o assistente de IA deste sistema de estudos.",
      "",
      "Minha função principal é ajudar você a estudar para concursos:",
      "",
      "- explicar assuntos;",
      "- transformar pedidos em questões;",
      "- montar simulados e revisões;",
      "- usar o contexto do chat para continuar uma linha de estudo.",
      "",
      "O modelo exato depende do provedor configurado no painel admin, como OpenAI, Claude ou OpenRouter. Eu não exponho chaves, prompts internos ou configurações privadas."
    ].join("\n");
  }

  if (normalized.includes("voce e daqui") || normalized.includes("você é daqui") || normalized.includes("voce esta aqui") || normalized.includes("você está aqui")) {
    return "Sou daqui no sentido de que faço parte deste aplicativo. Eu não sou uma pessoa local nem tenho um lugar físico; fico dentro do chat para ajudar nos estudos e na geração de questões.";
  }

  if (normalized.includes("voce fala") || normalized.includes("você fala") || normalized.includes("da pra falar") || normalized.includes("dá pra falar")) {
    return "Por enquanto eu converso por texto aqui no chat. Posso responder em linguagem natural, explicar conteúdos e montar questões. Voz pode ser uma função futura, mas ainda não está ativa nesta tela.";
  }

  if (
    normalized.includes("conversar sobre qualquer coisa") ||
    normalized.includes("conversar sobre qualque coisa") ||
    normalized.includes("qualquer assunto") ||
    normalized.includes("assuntos aleatorios") ||
    normalized.includes("assuntos aleatórios")
  ) {
    return "Podemos conversar sobre vários assuntos, sim. Só que meu melhor uso aqui é estudar para concurso: explicar temas, tirar dúvidas e transformar o que você trouxer em questões originais quando fizer sentido. Se o assunto sair muito desse contexto, eu tento responder de forma útil e puxar uma ponte para estudo quando couber.";
  }

  if (
    normalized.includes("voce faz qualquer questao") ||
    normalized.includes("você faz qualquer questão") ||
    normalized.includes("faz qualquer questao") ||
    normalized.includes("faz qualquer pergunta")
  ) {
    return [
      "Eu gero questões originais para estudo, principalmente no contexto de concurso público.",
      "",
      "Posso montar:",
      "",
      "- questões Certo/Errado;",
      "- questões de múltipla escolha;",
      "- simulados;",
      "- revisões baseadas nos seus erros e acertos.",
      "",
      "O que eu não faço é copiar prova real, vazar gabarito protegido, criar conteúdo perigoso ou burlar regras. Dentro desse limite, dá para montar muita coisa boa."
    ].join("\n");
  }

  if (
    normalized.includes("quem fala por voce") ||
    normalized.includes("quem fala por você") ||
    normalized.includes("quem responde por voce") ||
    normalized.includes("quem responde por você")
  ) {
    return "Quem responde aqui é um modelo de IA conectado ao aplicativo, seguindo as regras do produto. Eu não sou uma pessoa digitando por trás; sou o assistente do sistema, com acesso apenas ao contexto necessário do chat e às funções de estudo que o app permite.";
  }

  if (normalized.includes("mensagens anteriores") || normalized.includes("contexto") || normalized.includes("ja te disse")) {
    const lastUserGeneration = [...previousMessages]
      .reverse()
      .find((message) => message.role === AiChatRole.USER && looksLikeQuestionGeneration(message.content));
    if (lastUserGeneration) {
      return `Consigo ver as mensagens recentes deste chat, sim. O último pedido de geração que encontrei foi: “${lastUserGeneration.content.slice(0, 120)}”. Se você complementar com matéria, assunto, formato ou dificuldade, eu junto as peças e gero o bloco sem começar do zero.`;
    }
    return "Consigo usar o contexto recente deste chat, sim. Quando você manda uma continuação, eu tento ligar com o que veio antes. Só separo isso de perguntas gerais sobre mim ou sobre o funcionamento do sistema.";
  }

  return null;
}

function buildConversationalReply(prompt: string, previousMessages: Array<{ role: AiChatRole; content: string }>) {
  const normalized = normalizeText(prompt);
  const direct = buildDirectConversationalReply(prompt, previousMessages);
  if (direct) return direct;

  if (normalized.includes("bioma") && normalized.includes("brasil") && (normalized.includes("area") || normalized.includes("territorial"))) {
    return "Sim. O bioma com maior área territorial no Brasil é a Amazônia. Ela ocupa a maior porção do território brasileiro, principalmente na Região Norte. Se você quiser, posso transformar esse tema em questões de Geografia no estilo Certo/Errado ou múltipla escolha.";
  }

  if (normalized.includes("o que voce pode fazer") || normalized.includes("o que você pode fazer") || normalized.includes("como funciona")) {
    return [
      "Eu sou seu chat de estudo para concursos. Você pode jogar uma ideia meio solta e eu organizo o treino.",
      "",
      "Consigo ajudar com:",
      "",
      "- explicações rápidas de conteúdo;",
      "- blocos de questões por matéria e assunto;",
      "- simulados com dificuldade definida;",
      "- revisões baseadas nos seus erros e acertos recentes.",
      "",
      "Quer começar simples? Me diga uma matéria ou mande algo como: “gere 10 questões difíceis de geografia com 5 alternativas”."
    ].join("\n");
  }

  return [
    "Posso seguir a conversa e, quando fizer sentido para concurso público, transformar o tema em questões originais.",
    "",
    "Se quiser estudar agora, me mande do seu jeito:",
    "",
    "- matéria;",
    "- quantidade;",
    "- dificuldade;",
    "- formato.",
    "",
    "Eu completo o que faltar com escolhas razoáveis."
  ].join("\n");
}

function looksLikeContextualFollowUp(prompt: string) {
  const normalized = normalizeText(prompt);
  return [
    "quero",
    "pode ser",
    "na materia",
    "materia de",
    "sobre",
    "assunto",
    "informatica",
    "portugues",
    "matematica",
    "geografia",
    "historia",
    "certo",
    "errado",
    "alternativa",
    "dificil",
    "facil",
    "medio",
    "ja te disse",
    "anteriores"
  ].some((term) => normalized.includes(term));
}

function hasKnownSubject(normalizedPrompt: string) {
  return [
    "portugues",
    "matematica",
    "informatica",
    "historia",
    "geografia",
    "legislativo",
    "estado",
    "direito",
    "administrativo",
    "constitucional",
    "raciocinio",
    "atualidades",
    "biologia",
    "fisica",
    "quimica",
    "redacao"
  ].some((term) => normalizedPrompt.includes(term));
}

function isMetaConversation(prompt: string) {
  const normalized = normalizeText(prompt);
  return [
    "quem e voce",
    "quem é voce",
    "quem é você",
    "qual a sua versao",
    "versao do chatgpt",
    "voce e daqui",
    "você é daqui",
    "voce fala",
    "você fala",
    "conversar sobre qualquer coisa",
    "qualquer assunto",
    "assuntos aleatorios",
    "assuntos aleatórios",
    "voce faz qualquer questao",
    "você faz qualquer questão",
    "faz qualquer questao",
    "quem fala por voce",
    "quem fala por você",
    "quem responde por voce",
    "quem responde por você"
  ].some((term) => normalized.includes(term));
}

function shouldUseLocalDirectReply(level: AiChatPresetUsageLevel) {
  return level === AiChatPresetUsageLevel.MEDIO || level === AiChatPresetUsageLevel.ALTO;
}

function shouldUseLocalClarification(level: AiChatPresetUsageLevel) {
  return level === AiChatPresetUsageLevel.MEDIO || level === AiChatPresetUsageLevel.ALTO;
}

function shouldUseLocalFallback(level: AiChatPresetUsageLevel) {
  return level === AiChatPresetUsageLevel.ALTO;
}

function buildGenerationReply(input: {
  quantity: number;
  format: QuestionFormat;
  mode: QuestionSetMode;
  difficulty: Difficulty;
  subjectName: string;
  topicName: string;
}) {
  const formatLabel = input.format === QuestionFormat.CERTO_ERRADO ? "Certo/Errado" : "múltipla escolha";
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "bloco de estudo",
    [QuestionSetMode.SIMULADO]: "simulado",
    [QuestionSetMode.REVISAO]: "bloco de revisão"
  }[input.mode];
  const difficultyLabel = {
    [Difficulty.FACIL]: "fácil",
    [Difficulty.MEDIO]: "médio",
    [Difficulty.DIFICIL]: "difícil"
  }[input.difficulty];

  return `Boa. Preparei um ${modeLabel} com ${input.quantity} questões de ${input.subjectName}, em ${formatLabel}, no nível ${difficultyLabel}. Usei ${input.topicName} como eixo do bloco e deixei as justificativas prontas para você revisar depois da resposta. O bloco já está salvo no seu histórico. Quando quiser, é só começar por “Responder agora”.`;
}

function inferMode(prompt: string, formData: FormData): QuestionSetMode {
  const explicit = formData.get("mode") as QuestionSetMode | null;
  if (explicit) return explicit;
  if (prompt.includes("simulado") || prompt.includes("prova")) return QuestionSetMode.SIMULADO;
  if (prompt.includes("revisao") || prompt.includes("revisar") || prompt.includes("erros")) return QuestionSetMode.REVISAO;
  return QuestionSetMode.ESTUDO;
}

function inferFormat(prompt: string, formData: FormData): QuestionFormat {
  const explicit = formData.get("format") as QuestionFormat | null;
  if (explicit) return explicit;
  if (prompt.includes("multipla") || prompt.includes("alternativa") || prompt.includes("alternativas") || prompt.includes("opcoes")) {
    return QuestionFormat.MULTIPLA_ESCOLHA;
  }
  return QuestionFormat.CERTO_ERRADO;
}

function inferDifficulty(prompt: string, formData: FormData): Difficulty {
  const explicit = formData.get("difficulty") as Difficulty | null;
  if (explicit) return explicit;
  if (prompt.includes("facil") || prompt.includes("faceis")) return Difficulty.FACIL;
  if (prompt.includes("dificil") || prompt.includes("dificeis") || prompt.includes("avancad")) return Difficulty.DIFICIL;
  return Difficulty.MEDIO;
}

function inferAlternativesCount(prompt: string, formData: FormData) {
  const explicit = Number(formData.get("alternativesCount") ?? 0);
  if (explicit) return Math.min(Math.max(explicit, 2), 5);
  const match = prompt.match(/([2-5])\s*(alternativas|opcoes)/);
  return match ? Number(match[1]) : 4;
}

function inferQuantity(prompt: string, formData: FormData) {
  const explicit = Number(formData.get("quantity") ?? 0);
  if (explicit) return Math.min(Math.max(explicit, 1), 15);
  const match = prompt.match(/(\d{1,2})\s*(questoes|itens|perguntas)/);
  return match ? Math.min(Math.max(Number(match[1]), 1), 15) : 5;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function getOrCreateChatSession(userId: string, prompt: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId },
      include: { _count: { select: { messages: true } } }
    });
    if (existing) {
      if (existing._count.messages === 0 || existing.title === "Novo chat") {
        await prisma.aiChatSession.update({
          where: { id: existing.id },
          data: { title: titleFromPrompt(prompt) }
        });
      }
      return existing;
    }
  }

  return prisma.aiChatSession.create({
    data: { userId, title: titleFromPrompt(prompt) }
  });
}

function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "Novo chat";
  const withoutCommand = clean.replace(/^(gere|crie|faça|faca|monte|quero|preciso)\s+/i, "");
  return withoutCommand.length > 48 ? `${withoutCommand.slice(0, 45)}...` : withoutCommand;
}

export async function toggleFavoriteAction(formData: FormData) {
  const user = await requireUser();
  const questionId = String(formData.get("questionId") ?? "");
  const existing = await prisma.favoriteQuestion.findUnique({
    where: { userId_questionId: { userId: user.id, questionId } }
  });

  if (existing) {
    await prisma.favoriteQuestion.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoriteQuestion.create({ data: { userId: user.id, questionId } });
  }
  revalidatePath("/revisao");
}
