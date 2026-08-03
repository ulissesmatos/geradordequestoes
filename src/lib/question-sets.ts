import {
  AiUsageEventType,
  type Difficulty,
  type QuestionAnswer,
  type QuestionFormat,
  QuestionSetMode,
  QuestionStatus,
  SourceType,
  UsageKind,
  UsageMeter,
  type User
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateQuestions, type ReferenceVariantSource } from "@/lib/ai/generateQuestions";
import type { TokenUsage } from "@/lib/ai/pricing";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import {
  formatReviewedExamplesContext,
  getReviewedExampleQuestions,
  type ReviewedExampleQuestion
} from "@/lib/ai/reviewed-examples";
import { formatReferenceContext, getReferenceContext, searchReferenceQuestions, type ReferenceHit } from "@/lib/reference";
import { deepStripNullBytes, stripNullBytes, stripNullBytesNullable } from "@/lib/sanitize";
import { refundUsage, reserveUsage, resolveGenerationAllowance, settleUsage } from "@/lib/usage/ledger";

/**
 * Quantas provas reais buscar como âncora de estilo.
 *
 * Era 4 fixo, e o número aparece na tela para o aluno ("usando 4 questões reais de prova"),
 * então repetia sempre igual. Mas o motivo de variar não é estético: item difícil precisa de
 * mais referência para a banca "aparecer" no fraseado e nas pegadinhas, e bloco maior cobre
 * mais recortes do assunto. Sobe junto com os dois, com teto para não inflar o prompt.
 */
function referenceLimitFor(difficulty: Difficulty, quantity: number): number {
  const base = difficulty === "DIFICIL" ? 6 : difficulty === "MEDIO" ? 4 : 3;
  const byVolume = Math.ceil(quantity / 5);
  return Math.min(8, Math.max(base, byVolume));
}

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
  /**
   * Repassado a generateQuestions — permite ao chamador registrar custo parcial se a geração
   * falhar no meio de um bloco multi-lote (ver generateUserQuestionsAction).
   */
  onUsage?: (usage: TokenUsage) => void;
}) {
  const [subject, topic, allowance] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { id: input.subjectId } }),
    prisma.topic.findUniqueOrThrow({ where: { id: input.topicId } }),
    resolveGenerationAllowance(input.user)
  ]);

  /*
   * MEDIÇÃO DE QUESTÕES ACONTECE AQUI, e só aqui.
   *
   * Esta função é o funil único: chat, formulário e revisão dos erros passam todos por ela,
   * então nenhum caminho novo escapa do limite por esquecimento — a mesma razão pela qual o
   * teto de tamanho de bloco também mora aqui.
   *
   * NÃO mova a cobrança para os pontos de entrada e NÃO cobre também lá. Foi exatamente esse
   * o bug com AiUsageEvent: o chat contava uma unidade pela resposta e a geração contava
   * outra, então "gere 15 questões" consumia DUAS das 20 do plano Essencial. Só é seguro
   * medir nos dois lugares porque são medidores diferentes: a mensagem debita CHAT no entry
   * point, o bloco debita QUESTIONS aqui.
   */
  if (allowance.exhausted) {
    throw new Error(
      allowance.reason === "COTA_DIARIA"
        ? "Sua cota de questões de hoje acabou. Amanhã libera de novo, ou faça upgrade para gerar mais."
        : "Sua cota de questões deste ciclo acabou. Faça upgrade de plano para continuar gerando."
    );
  }

  const requestedQuantity = input.quantity;
  const quantity =
    allowance.maxPerBlock !== null ? Math.min(requestedQuantity, allowance.maxPerBlock) : requestedQuantity;
  const quantityCap =
    quantity < requestedQuantity
      ? { requested: requestedQuantity, applied: quantity, reason: allowance.reason }
      : null;

  const query = [input.prompt, topic.name, subject.name].filter(Boolean).join(" ");

  let variantSources: ReferenceVariantSource[] | undefined;
  let closeVariantFallback = false;
  if (input.closeVariant) {
    const variantLimit = Math.min(Math.max(quantity, 1), 30);
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

  // Grounding: busca questões reais de prova para âncora de estilo, e exemplares desta própria
  // plataforma já revisados por um humano no mesmo assunto (src/lib/ai/reviewed-examples.ts) —
  // dois canais de contexto separados do contexto do aluno, buscados em paralelo pra não somar
  // latência. Só roda quando NÃO estamos no modo variação fiel (que já buscou suas próprias
  // fontes acima).
  if (!variantSources) input.onProgress?.("Consultando provas reais no acervo…");
  const [referenceResult, reviewedExamples] = variantSources
    ? [{ hits: [] as ReferenceHit[], usedStructuredQuestions: true }, [] as ReviewedExampleQuestion[]]
    : await Promise.all([
        getReferenceContext({
          subjectId: input.subjectId,
          topicId: input.topicId,
          query,
          limit: referenceLimitFor(input.difficulty, quantity)
        }),
        getReviewedExampleQuestions({ subjectId: input.subjectId, topicId: input.topicId })
      ]);
  const { hits, usedStructuredQuestions } = referenceResult;
  const referenceBlock = formatReferenceContext(hits);
  const reviewedExamplesBlock = formatReviewedExamplesContext(reviewedExamples);
  // Informação real e útil: o aluno fica sabendo que o lote está ancorado em prova de verdade.
  if (usedStructuredQuestions && hits.length > 0) {
    input.onProgress?.(
      `Usando ${hits.length} ${hits.length === 1 ? "questão real de prova" : "questões reais de prova"} como base…`
    );
  }

  // Reserva feita AQUI, e não lá em cima: as buscas de referência já rodaram, então o número
  // reservado é o que vai de fato ao modelo (variação fiel pode ter achado menos fontes que o
  // pedido), e uma falha de busca não deixa reserva pendurada. Da reserva até o `settle`
  // existem exatamente duas operações que podem falhar, e as duas estão no try abaixo.
  const plannedQuantity = variantSources?.length ?? quantity;
  const ledgerId = await reserveUsage({
    user: input.user,
    meter: UsageMeter.QUESTIONS,
    kind: UsageKind.QUESTION_GENERATION,
    units: plannedQuantity,
    limits: allowance.limits
  });

  let generated: Awaited<ReturnType<typeof generateQuestions>>;
  let questionSet: Awaited<ReturnType<typeof createQuestionSetRow>>;
  try {
    generated = await generateQuestions({
      subject: subject.name,
      topic: topic.name,
      difficulty: input.difficulty,
      quantity: plannedQuantity,
      format: input.format,
      alternativesCount: input.alternativesCount,
      mode: input.mode,
      prompt: input.prompt,
      referenceContext: variantSources ? undefined : referenceBlock || undefined,
      reviewedExamplesContext: variantSources ? undefined : reviewedExamplesBlock || undefined,
      referenceQuestions: variantSources,
      context: input.context?.slice(0, 12000),
      modelOverride: input.modelOverride,
      onProgress: input.onProgress,
      onUsage: input.onUsage
    });

    questionSet = await createQuestionSetRow({ input, subject, topic, generated, variantSources });
  } catch (error) {
    // Não entregou bloco: devolve a reserva inteira.
    await refundUsage(ledgerId);
    throw error;
  }

  // Acerta pelo que o modelo realmente devolveu — ele às vezes traz um item a menos, e cobrar
  // o pedido em vez do entregue corroeria a cota do aluno sem ele entender por quê.
  await settleUsage(ledgerId, generated.questions.length);

  await prisma.aiGenerationLog.create({
    data: {
      userId: input.user.id,
      subjectId: input.subjectId,
      topicId: input.topicId,
      difficulty: input.difficulty,
      quantity: generated.questions.length,
      model: generated.model,
      prompt: stripNullBytes(generated.prompt),
      userPrompt: stripNullBytesNullable(input.prompt) || null,
      responseText: stripNullBytes(JSON.stringify(generated.questions)),
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      costUsd: generated.costUsd ?? undefined,
      status: input.user.role === "ADMIN" ? "SUCCESS" : "USER_SUCCESS"
    }
  });
  await recordAiUsageEvent({
    user: input.user,
    type: AiUsageEventType.QUESTION_GENERATION,
    model: generated.model,
    prompt: stripNullBytes(generated.prompt),
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    costUsd: generated.costUsd
  });

  return Object.assign(questionSet, {
    referenceUsed: usedStructuredQuestions,
    closeVariantCount: variantSources?.length ?? 0,
    // true quando o usuário pediu variação fiel mas não havia questões reais cadastradas
    // para essa matéria/assunto — o set foi gerado no modo padrão (âncora de estilo).
    closeVariantFallback,
    // Preenchido quando o pedido foi cortado — quem chamou usa `reason` para explicar o
    // motivo CERTO ao usuário (teto do plano, rajada do dia ou cota do ciclo).
    quantityCap
  });
}

/**
 * Grava o bloco e suas questões. Extraído só para manter a janela reserva→acerto legível no
 * corpo principal; não tem lógica de negócio própria.
 *
 * deepStripNullBytes cobre TODO o payload (título, prompt, enunciados, textos de apoio,
 * justificativas e alternativas): o Postgres rejeita NUL em coluna text e derruba o insert
 * inteiro, e o byte chega da resposta do modelo ou ecoado do material de referência (PDF).
 */
async function createQuestionSetRow(args: {
  input: {
    user: Pick<User, "id" | "role">;
    subjectId: string;
    topicId: string;
    chatSessionId?: string;
    title?: string;
    prompt: string;
    mode: QuestionSetMode;
    format: QuestionFormat;
    alternativesCount?: number;
    difficulty: Difficulty;
  };
  subject: { name: string };
  topic: { name: string };
  generated: Awaited<ReturnType<typeof generateQuestions>>;
  variantSources: ReferenceVariantSource[] | undefined;
}) {
  const { input, subject, topic, generated, variantSources } = args;
  const title = input.title || buildQuestionSetTitle(input.mode, subject.name, topic.name);

  return prisma.questionSet.create({
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
}

export function buildQuestionSetTitle(mode: QuestionSetMode, subject: string, topic: string) {
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "Estudo",
    [QuestionSetMode.SIMULADO]: "Simulado",
    [QuestionSetMode.REVISAO]: "Revisão"
  }[mode];
  return `${modeLabel}: ${subject} / ${topic}`;
}
