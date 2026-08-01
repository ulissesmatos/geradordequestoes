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
import { stripNullBytes } from "@/lib/sanitize";
import { difficultyLabel, questionFormatLabel, questionSetModeLabel } from "@/lib/labels";
import { inferMaterialTaxonomy, materialTitleFromPrompt } from "@/lib/materials";
import { buildQuestionSetTitle, generateAndSaveQuestionSet } from "@/lib/question-sets";
import { getPerformanceContext, getRecentAttachmentText, getRecentConversationText } from "@/lib/ai/chat/context";
import { chatTools, isChatToolName } from "@/lib/ai/chat/tools";
import { searchReferenceChunks, searchReferenceQuestions, searchWithinDocument } from "@/lib/reference";
import { canonicalSubjectName, closestByName, isPlausibleTopicName, matchByName } from "@/lib/taxonomy";
import { slugify } from "@/lib/utils";
import type { QuantityCapReason } from "@/lib/usage/ledger";
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
  /** Progresso em tempo real para a tela (ex.: a segunda geração do loop de reparo). */
  onProgress?: (label: string) => void;
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
        return await runGenerateQuestions(input.user, input.sessionId, input.userPrompt, rawArgs, input.onProgress);
      case "generate_study_material":
        return await runGenerateStudyMaterial(input.user, input.sessionId, rawArgs);
      case "get_performance":
        return await runGetPerformance(input.user, rawArgs);
      case "get_study_history":
        return await runGetStudyHistory(input.user, rawArgs);
      case "generate_review_from_mistakes":
        return await runGenerateReview(input.user, input.sessionId, input.userPrompt, rawArgs, input.onProgress);
      case "search_reference_material":
        return await runSearchReference(rawArgs);
      case "web_search":
        return await runWebSearch(rawArgs);
      case "get_question_set_results":
        return await runGetQuestionSetResults(input.user, rawArgs);
      case "ask_clarifying_question":
        // Interceptada e resolvida antes em runner.ts (encerra o turno); nunca deveria chegar aqui.
        return errorResult("ask_clarifying_question deve ser tratada pelo runner, não executada como ferramenta comum.");
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

type SubjectWithTopics = { id: string; name: string; topics: { id: string; name: string }[] };

type TaxonomyResolution =
  | {
      ok: true;
      subject: SubjectWithTopics;
      topic: { id: string; name: string };
      /** Preenchido quando não foi acerto direto — o modelo precisa avisar o usuário. */
      fallbackNote?: string;
    }
  | { ok: false; result: ToolExecutionResult };

/**
 * Resolve os rótulos livres de matéria/assunto vindos da IA para linhas reais do banco.
 *
 * Antes isto eram dois `return errorResult(...)` e um deles derrubava a geração num caso que
 * não é erro nenhum do usuário: matéria CADASTRADA mas sem nenhum assunto. Um aluno pediu
 * 10 questões de Raciocínio Lógico e recebeu "essa matéria ainda não tem assuntos
 * cadastrados" — falha de dado do admin cobrada do aluno.
 *
 * A regra agora é gerar sempre que houver como ancorar o pedido em algo real:
 *
 * 1. Matéria sem assuntos → CRIA o assunto pedido. Acontece uma vez por matéria e conserta
 *    o buraco sozinho, em vez de repetir o erro para todo aluno que pedir aquela matéria.
 * 2. Matéria não encontrada mas parecida com uma existente → usa a parecida e avisa.
 * 3. Assunto não encontrado dentro da matéria → usa o primeiro (o título do bloco já
 *    preserva o rótulo que o aluno pediu).
 *
 * O único caso que ainda pergunta em vez de gerar é quando NADA se relaciona ao pedido —
 * encaixar Direito Penal numa matéria sorteada corromperia o desempenho por matéria, que é
 * o dado que alimenta a revisão espaçada e o "assuntos para reforçar".
 */
async function resolveQuestionTaxonomy(subjectName: string, topicName?: string): Promise<TaxonomyResolution> {
  const subjects = await prisma.subject.findMany({
    include: { topics: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });
  if (subjects.length === 0) {
    return {
      ok: false,
      result: errorResult(
        "Não há matérias cadastradas no sistema. Explique que o administrador precisa cadastrar matérias antes de gerar questões."
      )
    };
  }

  // canonicalSubjectName primeiro: resolve variantes como "Raciocínio Lógico Matemático"
  // ou "Noções de Informática" antes de qualquer busca.
  const canonical = canonicalSubjectName(subjectName);
  let fallbackNote: string | undefined;

  let subject = matchByName(subjects, canonical);
  if (!subject) {
    const closest = closestByName(subjects, canonical);
    if (!closest) {
      return {
        ok: false,
        result: errorResult(
          `Não há matéria parecida com "${subjectName}" na plataforma. Matérias disponíveis: ${subjects
            .map((item) => item.name)
            .join(", ")}. Diga isso ao usuário e pergunte qual delas usar.`
        )
      };
    }
    subject = closest.item;
    fallbackNote = `O usuário pediu "${subjectName}", que não existe na plataforma; o bloco foi criado em "${subject.name}", a matéria mais próxima. Avise isso em uma frase, sem se desculpar demais.`;
  }

  const requestedTopic = topicName?.trim();
  const matchedTopic = requestedTopic ? matchByName(subject.topics, requestedTopic) : null;
  if (matchedTopic) return { ok: true, subject, topic: matchedTopic, fallbackNote };

  if (subject.topics.length > 0) {
    // Assunto pedido não existe, mas a matéria tem outros: ancora no primeiro. O título do
    // bloco preserva o rótulo pedido, então o aluno continua vendo o que pediu.
    return { ok: true, subject, topic: subject.topics[0], fallbackNote };
  }

  // Matéria sem nenhum assunto: cria. `Geral` é a rede de segurança quando o rótulo da IA é
  // longo ou estranho demais para virar item de catálogo.
  const newTopicName = requestedTopic && isPlausibleTopicName(requestedTopic) ? requestedTopic : "Geral";
  const created = await prisma.topic.upsert({
    where: { subjectId_slug: { subjectId: subject.id, slug: slugify(newTopicName) } },
    update: {},
    create: { subjectId: subject.id, name: newTopicName, slug: slugify(newTopicName) },
    select: { id: true, name: true }
  });
  return { ok: true, subject, topic: created, fallbackNote };
}

async function runGenerateQuestions(user: ToolUser, sessionId: string, userPrompt: string, rawArgs: unknown, onProgress?: (label: string) => void): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.generate_questions.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const taxonomy = await resolveQuestionTaxonomy(args.subjectName, args.topicName);
  if (!taxonomy.ok) return taxonomy.result;
  const { subject, topic, fallbackNote } = taxonomy;
  // Preserva no título o rótulo que o aluno pediu, mesmo quando ancoramos em outro assunto.
  const displayTopicName = args.topicName || topic.name;

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
    context,
    // Sem este repasse, TODO o progresso da geração morre no servidor: o funil emite
    // "usando N provas reais", "gerando questões 21 a 30 de 50" e "revisando", e a tela
    // ficava parada na primeira frase por minutos, parecendo travada.
    onProgress
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
      referenceUsed: questionSet.referenceUsed,
      ...quantityCapPayload(questionSet.quantityCap),
      ...(fallbackNote ? { materiaAproximada: fallbackNote } : {}),
      note: questionSet.referenceUsed
        ? "Bloco salvo na biblioteca do usuário. O app mostra o botão 'Responder agora' automaticamente; não invente links."
        : "Bloco salvo na biblioteca do usuário. O app mostra o botão 'Responder agora' automaticamente; não invente links. Avise brevemente que não havia prova real cadastrada sobre este ponto; as questões seguem o estilo da banca."
    }),
    fallbackMessage: buildGenerationFallback({
      quantity: questionSet.quantity,
      format,
      mode,
      difficulty,
      subjectName: subject.name,
      topicName: topic.name,
      referenceUsed: questionSet.referenceUsed,
      quantityCap: questionSet.quantityCap
    })
  };
}

type QuantityCap = { requested: number; applied: number; reason: QuantityCapReason | null } | null;

/**
 * Explicação do corte, na voz do motivo CERTO.
 *
 * Antes toda mensagem culpava o "plano gratuito" — o que virou mentira quando assinante passou
 * a poder esbarrar na rajada diária ou na cota do ciclo. Cada motivo tem um desfecho diferente:
 * teto de bloco se resolve assinando, rajada diária se resolve amanhã.
 */
function capExplanation(cap: NonNullable<QuantityCap>): { curta: string; saida: string } {
  switch (cap.reason) {
    case "COTA_DIARIA":
      return {
        curta: `sua cota de questões de hoje só permitia ${cap.applied}`,
        saida: "A cota diária renova amanhã; se precisar de mais volume hoje, dá para fazer upgrade de plano."
      };
    case "COTA_MENSAL":
      return {
        curta: `sua cota de questões deste ciclo só permitia ${cap.applied}`,
        saida: "A cota renova na virada do seu ciclo; para gerar mais agora, o caminho é o upgrade de plano."
      };
    case "TAMANHO_DO_BLOCO":
      return {
        curta: `seu plano gera até ${cap.applied} questões por bloco`,
        saida: "Planos superiores geram blocos maiores de uma vez."
      };
    case "TETO_DO_PRODUTO":
      return {
        curta: `${cap.applied} é o máximo por bloco`,
        saida: "É o limite para as questões saírem com qualidade. Peça outro bloco em seguida se quiser mais."
      };
    default:
      return {
        curta: `o plano gratuito gera até ${cap.applied} questões por bloco`,
        saida: "Assinando um plano, os blocos saem no tamanho que você pedir."
      };
  }
}

/**
 * Instrução para o modelo quando o pedido foi cortado. Vai no resultado da ferramenta (e não só
 * no prompt) porque é aqui que sabemos o número que o usuário pediu de fato — sem isso o
 * assistente confirmava "gerei 20 questões" enquanto o bloco tinha 5.
 */
function quantityCapPayload(cap: QuantityCap) {
  if (!cap) return {};
  const { curta, saida } = capExplanation(cap);
  return {
    limiteAplicado: {
      pedido: cap.requested,
      teto: cap.applied,
      motivo: cap.reason ?? "PLANO_GRATUITO",
      instrucao: `O usuário pediu ${cap.requested} questões, mas ${curta}. Confirme usando o campo "quantity" deste resultado (é o número real de questões do bloco) e explique o motivo em uma frase: ${saida} Não prometa as ${cap.requested} nem sugira driblar o limite pedindo vários blocos seguidos.`
    }
  };
}

/**
 * Frase de corte reaproveitada nas duas ferramentas de geração. Fala do TETO, não de quantas
 * questões chegaram: o modelo às vezes devolve um item a menos, e a contagem real já aparece
 * na frase anterior da confirmação.
 */
function quantityCapSentence(cap: QuantityCap) {
  if (!cap) return "";
  const { curta, saida } = capExplanation(cap);
  return `\n\nObs.: você pediu ${cap.requested} questões, mas ${curta}. ${saida}`;
}

async function runGenerateStudyMaterial(user: ToolUser, sessionId: string, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.generate_study_material.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  const materialPrompt = [args.topic, args.focus].filter(Boolean).join(" — ");
  const [recentContext, performanceContext] = await Promise.all([
    getRecentConversationText(sessionId),
    getPerformanceContext(user.id)
  ]);
  const context = [recentContext, performanceContext]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5200);

  // NÃO cobra o medidor CHAT aqui: esta ferramenta só roda dentro de um turno de chat, que
  // já debitou 1 unidade no ponto de entrada. Cobrar de novo seria exatamente a dupla
  // cobrança que o medidor novo veio corrigir. O AiUsageEvent abaixo é log bruto por chamada
  // ao provedor, não livro-caixa.
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
      // Conteúdo vem inteiro do modelo: NUL aqui derrubaria a gravação (Postgres 22021).
      content: stripNullBytes(generated.content),
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

async function runGenerateReview(user: ToolUser, sessionId: string, userPrompt: string, rawArgs: unknown, onProgress?: (label: string) => void): Promise<ToolExecutionResult> {
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
    context: [await getRecentConversationText(sessionId), target.context].filter(Boolean).join("\n\n").slice(0, 5200),
    onProgress
  });

  return {
    questionSetId: questionSet.id,
    resultForModel: JSON.stringify({
      ok: true,
      title: questionSet.title,
      quantity: questionSet.quantity,
      focus: `${target.subjectName} / ${target.topicName}`,
      ...quantityCapPayload(questionSet.quantityCap),
      note: "Bloco de revisão salvo na biblioteca. O app mostra o botão 'Responder agora' automaticamente; não invente links."
    }),
    fallbackMessage: [
      "Boa. Gerei uma revisão personalizada usando seus erros recentes.",
      "",
      `Foco principal: **${target.subjectName} / ${target.topicName}**.`,
      `O bloco ficou salvo no seu histórico com ${questionSet.quantity} questões. Você pode responder agora ou voltar nele depois.`
    ].join("\n") + quantityCapSentence(questionSet.quantityCap)
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

  const limit = args.limit ?? 5;

  // Material citado por nome (do catálogo): restringe a busca só a ele, para não
  // deixar um material curto "ofuscar" um documento grande numa busca livre no acervo todo.
  if (args.documentTitle) {
    const documents = await prisma.referenceDocument.findMany({ select: { id: true, title: true } });
    const target = matchByName(
      documents.map((d) => ({ ...d, name: d.title })),
      args.documentTitle
    );
    if (target) {
      const { hits, totalChunks } = await searchWithinDocument({
        documentId: target.id,
        query: args.query,
        limit,
        offset: args.offset
      });
      if (hits.length === 0) {
        return {
          resultForModel: JSON.stringify({
            ok: true,
            results: [],
            note: `Não encontrei trechos de "${target.title}" para esses termos. Responda com seu conhecimento, deixando claro que não achou essa parte específica no material interno.`
          })
        };
      }
      return {
        resultForModel: JSON.stringify({
          ok: true,
          results: hits.map((h) => ({ title: h.title, source: h.source, excerpt: h.content.slice(0, 900) })),
          totalChunksInDocument: totalChunks,
          note:
            totalChunks > hits.length
              ? `Recorte de "${target.title}" (${totalChunks} trechos no total nesse material). Se faltar algo que o usuário pediu, chame a ferramenta de novo com documentTitle="${target.title}" e um offset maior, ou uma busca mais específica. Cite a fonte ao usuário.`
              : `Trechos completos de "${target.title}". Cite a fonte ao usuário.`
        })
      };
    }
  }

  // 1) Banco estruturado: questões extraídas por IA (gabarito/pegadinha já mapeados).
  // O filtro de matéria é suave dentro de searchReferenceQuestions (matéria pedida OU sem
  // classificação), então não refazemos a busca sem filtro: trazer questão de outra matéria
  // como fundamento é pior do que responder que não há material interno sobre o ponto.
  const questionHits = await searchReferenceQuestions({ query: args.query, subjectId, topicId, limit });
  if (questionHits.length > 0) {
    return {
      resultForModel: JSON.stringify({
        ok: true,
        questions: questionHits.map((q) => ({
          statement: q.statement.slice(0, 900),
          gabarito: q.answer ?? q.answerText ?? null,
          justificativa: q.explanation?.slice(0, 500) ?? null,
          pegadinha: q.trickNote ?? null,
          dependeDeImagem: q.hasImage,
          imagem: q.imageDescription ?? null,
          assunto: q.topicHint ?? null,
          fonte: `${q.title}${q.source ? ` — ${q.source}` : ""}`
        })),
        note: "Questões REAIS extraídas dos materiais cadastrados, com gabarito conferido. Use como fundamento e cite a fonte ao usuário. Se a questão depende de imagem/charge, avise que o original tem elemento visual."
      })
    };
  }

  // 2) Fallback: busca crua nos trechos dos documentos (mesmo filtro suave de matéria).
  const hits = await searchReferenceChunks({ query: args.query, subjectId, topicId, limit });
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

async function runGetQuestionSetResults(user: ToolUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const parsed = parseArgs(chatTools.get_question_set_results.schema, rawArgs);
  if (!parsed.ok) return parsed.result;
  const args = parsed.args;

  let subjectId: string | undefined;
  let topicId: string | undefined;
  if (args.subjectName) {
    const subjects = await prisma.subject.findMany({ include: { topics: true } });
    const subject = matchByName(subjects, args.subjectName);
    if (subject) {
      subjectId = subject.id;
      if (args.topicName) topicId = matchByName(subject.topics, args.topicName)?.id;
    }
  }

  const questionSet = await prisma.questionSet.findFirst({
    where: {
      userId: user.id,
      ...(args.which === "last_simulado" ? { mode: QuestionSetMode.SIMULADO } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(topicId ? { topicId } : {})
    },
    orderBy: { createdAt: "desc" },
    include: {
      subject: true,
      topic: true,
      questions: { include: { options: true }, orderBy: { orderInSet: "asc" } }
    }
  });

  if (!questionSet) {
    const kind = args.which === "last_simulado" ? "simulado" : "bloco";
    return errorResult(
      `Nenhum ${kind} encontrado${args.subjectName ? ` em ${args.subjectName}` : ""}. Avise o usuário que não há dados disponíveis.`
    );
  }

  const questionIds = questionSet.questions.map((q) => q.id);
  const attempts = questionIds.length
    ? await prisma.questionAttempt.findMany({
        where: { userId: user.id, questionId: { in: questionIds } },
        orderBy: { createdAt: "desc" }
      })
    : [];

  // Dedupe: primeiro visto = mais recente (orderBy DESC)
  const latestByQ = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    if (!latestByQ.has(a.questionId)) latestByQ.set(a.questionId, a);
  }

  const total = questionSet.questions.length;
  const answered = latestByQ.size;
  const correct = [...latestByQ.values()].filter((a) => a.isCorrect).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  const wrongLines: string[] = [];
  const unansweredLines: string[] = [];

  for (const q of questionSet.questions) {
    const attempt = latestByQ.get(q.id);
    if (!attempt) {
      unansweredLines.push(`- ${q.statement.slice(0, 120).trim()}…`);
      continue;
    }
    if (!attempt.isCorrect) {
      let yourAnswer: string;
      let correctAnswer: string;
      if (q.format === "CERTO_ERRADO") {
        yourAnswer = attempt.userAnswer ?? "não respondido";
        correctAnswer = q.answer ?? "?";
      } else {
        const selected = q.options.find((o) => o.id === attempt.selectedOptionId);
        const correctOpt = q.options.find((o) => o.isCorrect);
        yourAnswer = selected ? `${selected.label}) ${selected.text}` : "não respondido";
        correctAnswer = correctOpt ? `${correctOpt.label}) ${correctOpt.text}` : "?";
      }
      wrongLines.push(
        `- ${q.statement.slice(0, 140).trim()}…\n  Sua resposta: **${yourAnswer}** | Gabarito: **${correctAnswer}**`
      );
    }
  }

  const lines = [
    `**${questionSet.title}**`,
    `Resultado: **${correct}/${total} (${pct}%)**`,
    answered < total ? `(${total - answered} questão(ões) não respondida(s))` : "",
    "",
    wrongLines.length > 0 ? `**Questões erradas (${wrongLines.length}):**\n${wrongLines.join("\n")}` : "Nenhuma questão errada — parabéns!",
    unansweredLines.length > 0 ? `\n**Não respondidas (${unansweredLines.length}):**\n${unansweredLines.join("\n")}` : ""
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { resultForModel: lines };
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
  referenceUsed: boolean;
  quantityCap?: QuantityCap;
}) {
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "bloco de estudo",
    [QuestionSetMode.SIMULADO]: "simulado",
    [QuestionSetMode.REVISAO]: "bloco de revisão"
  }[input.mode];
  const base = `Boa. Preparei um ${modeLabel} com ${input.quantity} questões de ${input.subjectName}, em ${questionFormatLabel(input.format)}, no nível ${difficultyLabel(input.difficulty).toLowerCase()}. Usei ${input.topicName} como eixo do bloco e deixei as justificativas prontas para você revisar depois da resposta. O bloco já está salvo no seu histórico. Quando quiser, é só começar por "Responder agora".`;
  const withReference = input.referenceUsed
    ? base
    : `${base}\n\nObs.: não havia prova real cadastrada sobre este ponto — as questões foram criadas no estilo Cebraspe.`;
  return withReference + quantityCapSentence(input.quantityCap ?? null);
}

