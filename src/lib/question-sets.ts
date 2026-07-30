import {
  AiUsageEventType,
  type Difficulty,
  type QuestionAnswer,
  type QuestionFormat,
  QuestionSetMode,
  QuestionStatus,
  SourceType,
  type User
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateQuestions, type ReferenceVariantSource } from "@/lib/ai/generateQuestions";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import { formatReferenceContext, getReferenceContext, searchReferenceQuestions } from "@/lib/reference";
import { deepStripNullBytes, stripNullBytes } from "@/lib/sanitize";

export async function generateAndSaveQuestionSet(input: {
  user: Pick<User, "id" | "role">;
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  quantity: number;
  format: QuestionFormat;
  alternativesCount?: number;
  mode: QuestionSetMode;
  prompt: string;
  title?: string;
  chatSessionId?: string;
  context?: string;
  modelOverride?: string;
  /**
   * Modo "variação fiel": em vez de só se inspirar no estilo das provas reais, gera uma
   * variação bem próxima (podendo reaproveitar boa parte do enunciado) para CADA questão
   * real encontrada no acervo — até o limite de `quantity`. Se não houver questões
   * estruturadas cadastradas para a matéria/assunto, cai automaticamente no modo padrão
   * (âncora de estilo) — ver `closeVariantFallback` no retorno.
   */
  closeVariant?: boolean;
  /** Repassado a generateQuestions para a tela mostrar o que está acontecendo de fato. */
  onProgress?: (label: string) => void;
}) {
  const [subject, topic] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { id: input.subjectId } }),
    prisma.topic.findUniqueOrThrow({ where: { id: input.topicId } })
  ]);

  const query = [input.prompt, topic.name, subject.name].filter(Boolean).join(" ");

  let variantSources: ReferenceVariantSource[] | undefined;
  let closeVariantFallback = false;
  if (input.closeVariant) {
    const variantLimit = Math.min(Math.max(input.quantity, 1), 30);
    // O filtro de matéria em searchReferenceQuestions é suave (matéria pedida OU questão sem
    // classificação), então não refazemos sem filtro: gerar "variação fiel" a partir de uma
    // questão de outra matéria produziria item fora do assunto pedido.
    const variantHits = await searchReferenceQuestions({
      query,
      subjectId: input.subjectId,
      topicId: input.topicId,
      limit: variantLimit
    });
    if (variantHits.length > 0) {
      variantSources = variantHits.map((hit) => ({
        id: hit.id,
        statement: hit.statement,
        supportText: hit.supportText,
        answer: hit.answer,
        answerText: hit.answerText,
        explanation: hit.explanation,
        trickNote: hit.trickNote
      }));
    } else {
      closeVariantFallback = true;
    }
  }

  // Grounding: busca questões reais de prova para âncora de estilo — canal separado do contexto do aluno.
  // Só roda quando NÃO estamos no modo variação fiel (que já buscou suas próprias fontes acima).
  const { hits, usedStructuredQuestions } = variantSources
    ? { hits: [], usedStructuredQuestions: true }
    : await getReferenceContext({
        subjectId: input.subjectId,
        topicId: input.topicId,
        query,
        limit: 4
      });
  const referenceBlock = formatReferenceContext(hits);
  // Informação real e útil: o aluno fica sabendo que o lote está ancorado em prova de verdade.
  if (usedStructuredQuestions && hits.length > 0) {
    input.onProgress?.(
      `Usando ${hits.length} ${hits.length === 1 ? "questão real de prova" : "questões reais de prova"} como base…`
    );
  }

  const generated = await generateQuestions({
    subject: subject.name,
    topic: topic.name,
    difficulty: input.difficulty,
    quantity: variantSources?.length ?? input.quantity,
    format: input.format,
    alternativesCount: input.alternativesCount,
    mode: input.mode,
    prompt: input.prompt,
    referenceContext: variantSources ? undefined : referenceBlock || undefined,
    referenceQuestions: variantSources,
    context: input.context?.slice(0, 12000),
    modelOverride: input.modelOverride,
    onProgress: input.onProgress
  });

  const title = input.title || buildQuestionSetTitle(input.mode, subject.name, topic.name);

  // deepStripNullBytes cobre TODO o payload (título, prompt, enunciados, textos de apoio,
  // justificativas e alternativas). Postgres rejeita NUL em coluna text e derruba o insert
  // inteiro; o byte chega da resposta do modelo ou ecoado do material de referência (PDF).
  const questionSet = await prisma.questionSet.create({
    data: deepStripNullBytes({
      userId: input.user.id,
      subjectId: input.subjectId,
      topicId: input.topicId,
      chatSessionId: input.chatSessionId,
      title,
      prompt: input.prompt,
      mode: input.mode,
      format: input.format,
      alternativesCount: input.format === "MULTIPLA_ESCOLHA" ? input.alternativesCount ?? 4 : null,
      difficulty: input.difficulty,
      quantity: generated.questions.length,
      aiModel: generated.model,
      questions: {
        create: generated.questions.map((question, index) => {
          const sourceReferenceQuestionId = variantSources
            ? (question.sourceIndex ? variantSources[question.sourceIndex - 1]?.id : undefined) ?? variantSources[index]?.id
            : undefined;
          return {
            subject: { connect: { id: input.subjectId } },
            topic: { connect: { id: input.topicId } },
            orderInSet: index + 1,
            format: question.format as QuestionFormat,
            statement: question.statement,
            supportText: question.supportText ?? null,
            answer: (question.answer ?? null) as QuestionAnswer | null,
            explanation: question.explanation,
            difficulty: question.difficulty as Difficulty,
            status: QuestionStatus.DRAFT,
            sourceType: SourceType.AI,
            aiModel: generated.model,
            createdBy: { connect: { id: input.user.id } },
            ...(sourceReferenceQuestionId ? { sourceReferenceQuestion: { connect: { id: sourceReferenceQuestionId } } } : {}),
            options: {
              create: question.options.map((option, optionIndex) => ({
                label: option.label,
                text: option.text,
                isCorrect: option.isCorrect,
                order: optionIndex + 1
              }))
            }
          };
        })
      }
    }),
    include: { questions: { select: { id: true } } }
  });

  await prisma.aiGenerationLog.create({
    data: {
      adminId: input.user.id,
      subjectId: input.subjectId,
      topicId: input.topicId,
      difficulty: input.difficulty,
      quantity: generated.questions.length,
      model: generated.model,
      prompt: stripNullBytes(generated.prompt),
      status: input.user.role === "ADMIN" ? "SUCCESS" : "USER_SUCCESS"
    }
  });
  await recordAiUsageEvent({
    user: input.user,
    type: AiUsageEventType.QUESTION_GENERATION,
    model: generated.model,
    prompt: stripNullBytes(generated.prompt)
  });

  return Object.assign(questionSet, {
    referenceUsed: usedStructuredQuestions,
    closeVariantCount: variantSources?.length ?? 0,
    // true quando o usuário pediu variação fiel mas não havia questões reais cadastradas
    // para essa matéria/assunto — o set foi gerado no modo padrão (âncora de estilo).
    closeVariantFallback
  });
}

export function buildQuestionSetTitle(mode: QuestionSetMode, subject: string, topic: string) {
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "Estudo",
    [QuestionSetMode.SIMULADO]: "Simulado",
    [QuestionSetMode.REVISAO]: "Revisão"
  }[mode];
  return `${modeLabel}: ${subject} / ${topic}`;
}
