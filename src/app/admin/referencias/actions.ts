"use server";

import { ReferenceExtractionStatus, ReferenceKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { extractReferenceQuestions } from "@/lib/ai/extract-reference";
import { logAdminAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { ingestReferenceDocument } from "@/lib/reference";
import { cleanExtractedText } from "@/lib/sanitize";
import { isPlausibleSubjectName, matchByName, resolveSubjectFromHint } from "@/lib/taxonomy";
import { slugify } from "@/lib/utils";

async function extractPdfText(file: File): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    // Limpa NUL/controles na entrada: esse texto vira trechos indexados e depois
    // contexto de prompt, então um byte inválido aqui contamina tudo a jusante.
    return cleanExtractedText(merged).trim();
  } catch {
    return "";
  }
}

export async function createReferenceAction(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim() || null;
  const kindRaw = String(formData.get("kind") ?? "OUTRO");
  const kind = (Object.values(ReferenceKind) as string[]).includes(kindRaw) ? (kindRaw as ReferenceKind) : ReferenceKind.OUTRO;
  let subjectId = String(formData.get("subjectId") ?? "") || null;
  const topicId = String(formData.get("topicId") ?? "") || null;

  if (!title) throw new Error("Informe um título para o material.");

  // Texto: colado e/ou extraído de PDF.
  let text = String(formData.get("text") ?? "");
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const extracted = await extractPdfText(file);
    text = [text, extracted].filter(Boolean).join("\n\n");
  }
  if (!text.trim()) throw new Error("Cole o texto do material ou envie um PDF com texto extraível.");

  // Se o assunto foi escolhido, deriva a matéria dele (consistência).
  if (topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { subjectId: true } });
    if (topic) subjectId = topic.subjectId;
  }

  const result = await ingestReferenceDocument({
    title,
    source,
    kind,
    subjectId,
    topicId,
    createdById: admin.id,
    text
  });

  await logAdminAction(admin, {
    action: "create",
    entity: "ReferenceDocument",
    entityId: result.documentId,
    summary: `${title} (${result.chunks} trechos)`
  });
  revalidatePath("/admin/referencias");
}

export async function deleteReferenceAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.referenceDocument.delete({ where: { id } }); // cascade remove chunks e questões extraídas
  await logAdminAction(admin, { action: "delete", entity: "ReferenceDocument", entityId: id });
  revalidatePath("/admin/referencias");
}

// ── Extração estruturada por IA ───────────────────────────────────────────────

/**
 * Chunks (~1500 chars) processados por chamada de IA. Lote menor = menos questões
 * por resposta, reduzindo o risco de o JSON de saída ser truncado pelo limite de
 * tokens (sobretudo no Claude, que pode serializar o array como string escapada).
 */
const CHUNKS_PER_BATCH = 5;

/**
 * Quantos chunks do lote ANTERIOR entram de novo no próximo lote, como contexto.
 * Precisa ser grande o bastante pra cobrir um texto de apoio inteiro (situação
 * hipotética, texto de leitura) que tenha ficado perto da borda do lote anterior —
 * senão os itens que dependem dele processam sem o texto visível, e a IA acaba
 * resumindo/referenciando em vez de copiar o texto de verdade (ou pior, inventando).
 * Reprocessa alguns chunks à toa, mas o dedup por statement já existente cobre isso.
 */
const BATCH_OVERLAP_CHUNKS = 3;

export type ExtractionProgress = {
  status: ReferenceExtractionStatus;
  processedChunks: number;
  totalChunks: number;
  extractedTotal: number;
  done: boolean;
  error?: string;
};

function normalizeStatement(statement: string) {
  return statement.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Nota de procedência das matérias nascidas da extração — permite ao admin achá-las e mesclar depois. */
const AUTO_SUBJECT_DESCRIPTION = "Criada automaticamente pela extração de materiais de referência.";

type SubjectWithTopics = { id: string; name: string; topics: { id: string; name: string }[] };

/**
 * Resolve a matéria de UMA questão extraída a partir do rótulo livre que a IA devolveu
 * (`subjectHint`), criando a matéria quando não existir.
 *
 * O cache é obrigatório para correção, não só performance: dentro de um mesmo lote várias
 * questões trazem o mesmo hint, e sem ele duas criações concorreriam pelo mesmo slug único.
 */
async function resolveOrCreateSubjectId(input: {
  hint: string | null | undefined;
  subjects: SubjectWithTopics[];
  createdSubjects: string[];
}): Promise<string | null> {
  const { subject, canonicalName } = resolveSubjectFromHint({ hint: input.hint, subjects: input.subjects });
  if (subject) return subject.id;
  if (!canonicalName || !isPlausibleSubjectName(canonicalName)) return null;

  // upsert por slug (nunca create): slug é único global e slugify normaliza acento/caixa,
  // então "Português" e "portugues" convergem para a MESMA linha em vez de estourar.
  const created = await prisma.subject.upsert({
    where: { slug: slugify(canonicalName) },
    update: {},
    create: { name: canonicalName, slug: slugify(canonicalName), description: AUTO_SUBJECT_DESCRIPTION },
    select: { id: true, name: true }
  });
  // Alimenta a lista em memória para as próximas questões do lote reusarem esta matéria.
  if (!input.subjects.some((s) => s.id === created.id)) {
    input.subjects.push({ ...created, topics: [] });
    input.createdSubjects.push(created.name);
  }
  return created.id;
}

/** Assunto só é casado contra os tópicos JÁ existentes da matéria — nunca criado (evitaria centenas de linhas). */
function resolveTopicId(input: { hint: string | null | undefined; subjectId: string | null; subjects: SubjectWithTopics[] }) {
  if (!input.subjectId || !input.hint?.trim()) return null;
  const subject = input.subjects.find((s) => s.id === input.subjectId);
  if (!subject?.topics.length) return null;
  return matchByName(subject.topics, input.hint)?.id ?? null;
}

/**
 * Processa o PRÓXIMO lote de trechos do documento com IA, extraindo questões
 * estruturadas. Chamada repetidamente pelo client até `done` (evita timeout de
 * serverless e mostra progresso real). Idempotente por cursor.
 */
export async function processReferenceBatchAction(documentId: string): Promise<ExtractionProgress> {
  const admin = await requireAdmin();

  const document = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      subjectId: true,
      topicId: true,
      extractionCursor: true,
      extractionStatus: true,
      _count: { select: { chunks: true, questions: true } }
    }
  });
  if (!document) {
    return { status: ReferenceExtractionStatus.ERROR, processedChunks: 0, totalChunks: 0, extractedTotal: 0, done: true, error: "Material não encontrado." };
  }

  const totalChunks = document._count.chunks;
  if (document.extractionCursor >= totalChunks) {
    if (document.extractionStatus !== ReferenceExtractionStatus.DONE) {
      await prisma.referenceDocument.update({
        where: { id: document.id },
        data: { extractionStatus: ReferenceExtractionStatus.DONE, extractionError: null }
      });
      revalidatePath("/admin/referencias");
    }
    return {
      status: ReferenceExtractionStatus.DONE,
      processedChunks: totalChunks,
      totalChunks,
      extractedTotal: document._count.questions,
      done: true
    };
  }

  try {
    await prisma.referenceDocument.update({
      where: { id: document.id },
      data: { extractionStatus: ReferenceExtractionStatus.PROCESSING, extractionError: null }
    });

    // Lote atual + uma cauda maior do lote anterior (overlap), marcada separadamente como
    // "contexto" — dá continuidade a um texto de apoio que tenha começado perto da borda do
    // lote anterior, sem pedir pra IA extrair questões dessa parte de novo (evita duplicar
    // trabalho; o dedup por statement já existente ainda cobre o caso de sobrar algo).
    const overlapFrom = Math.max(0, document.extractionCursor - BATCH_OVERLAP_CHUNKS);
    const [overlapChunks, newChunks] = await Promise.all([
      document.extractionCursor > 0
        ? prisma.referenceChunk.findMany({
            where: { documentId: document.id, ordinal: { gte: overlapFrom, lt: document.extractionCursor } },
            orderBy: { ordinal: "asc" },
            select: { content: true }
          })
        : Promise.resolve([]),
      prisma.referenceChunk.findMany({
        where: { documentId: document.id, ordinal: { gte: document.extractionCursor, lt: document.extractionCursor + CHUNKS_PER_BATCH } },
        orderBy: { ordinal: "asc" },
        select: { content: true }
      })
    ]);
    const overlapText = overlapChunks.map((c) => c.content).join("\n\n");
    const newText = newChunks.map((c) => c.content).join("\n\n");
    const text = overlapText
      ? `[CONTEXTO DO TRECHO ANTERIOR — só para dar continuidade a um texto de apoio que comece aqui e continue no trecho novo abaixo; NÃO extraia questões deste bloco, elas já foram processadas]\n${overlapText}\n\n[TRECHO NOVO — extraia as questões completas daqui]\n${newText}`
      : newText;

    // Catálogo real de matérias: vai no prompt (a IA prefere um nome existente) e serve de
    // base para resolver o subjectHint de cada questão logo abaixo.
    const subjects: SubjectWithTopics[] = await prisma.subject.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, topics: { select: { id: true, name: true }, orderBy: { name: "asc" } } }
    });

    const extraction = text.trim()
      ? await extractReferenceQuestions(text, subjects.map((s) => s.name))
      : { questions: [], model: "", provider: null };
    const extracted = extraction.questions;

    // Dedupe contra o que já foi extraído deste documento (overlap entre lotes).
    const existing = await prisma.referenceQuestion.findMany({
      where: { documentId: document.id },
      select: { statement: true }
    });
    const seen = new Set(existing.map((q) => normalizeStatement(q.statement)));
    const fresh = extracted.filter((q) => {
      const key = normalizeStatement(q.statement);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const nextCursor = Math.min(document.extractionCursor + CHUNKS_PER_BATCH, totalChunks);
    const isDone = nextCursor >= totalChunks;

    // Classificação por questão. Uma prova de concurso mistura várias matérias, então a
    // matéria do documento (quando o admin escolheu uma) tem precedência, e no resto vale o
    // subjectHint que a IA deu para AQUELA questão. Resolvido fora da $transaction porque
    // pode criar matéria nova (escrita própria).
    const createdSubjects: string[] = [];
    const rows = [];
    for (const [i, q] of fresh.entries()) {
      const subjectId =
        document.subjectId ?? (await resolveOrCreateSubjectId({ hint: q.subjectHint, subjects, createdSubjects }));
      rows.push({
        documentId: document.id,
        subjectId,
        topicId: document.topicId ?? resolveTopicId({ hint: q.topicHint, subjectId, subjects }),
        statement: q.statement,
        supportText: q.supportText,
        answer: q.answer,
        answerText: q.answerText,
        explanation: q.explanation,
        trickNote: q.trickNote,
        hasImage: q.hasImage,
        imageDescription: q.imageDescription,
        topicHint: q.topicHint,
        subjectHint: q.subjectHint,
        regionHint: q.regionHint,
        ordinal: existing.length + i
      });
    }

    await prisma.$transaction([
      ...(rows.length ? [prisma.referenceQuestion.createMany({ data: rows })] : []),
      prisma.referenceDocument.update({
        where: { id: document.id },
        data: {
          extractionCursor: nextCursor,
          extractionStatus: isDone ? ReferenceExtractionStatus.DONE : ReferenceExtractionStatus.PROCESSING
        }
      })
    ]);

    // Matéria criada automaticamente é sempre logada (inclusive em lote intermediário) — é
    // escrita no catálogo que o aluno vê, então precisa de rastro mesmo se a extração falhar depois.
    if (createdSubjects.length) {
      await logAdminAction(admin, {
        action: "create",
        entity: "Subject",
        entityId: document.id,
        summary: `Matérias criadas pela extração de "${document.title}": ${createdSubjects.join(", ")}`
      });
    }

    if (isDone) {
      await logAdminAction(admin, {
        action: "extract",
        entity: "ReferenceDocument",
        entityId: document.id,
        summary: `${document.title}: ${existing.length + fresh.length} questões extraídas (modelo: ${extraction.model || "padrão"})`
      });
      revalidatePath("/admin/referencias");
      revalidatePath("/admin/materias");
    }

    return {
      status: isDone ? ReferenceExtractionStatus.DONE : ReferenceExtractionStatus.PROCESSING,
      processedChunks: nextCursor,
      totalChunks,
      extractedTotal: existing.length + fresh.length,
      done: isDone
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Erro desconhecido na extração.").slice(0, 300);
    await prisma.referenceDocument.update({
      where: { id: document.id },
      data: { extractionStatus: ReferenceExtractionStatus.ERROR, extractionError: message }
    });
    revalidatePath("/admin/referencias");
    return {
      status: ReferenceExtractionStatus.ERROR,
      processedChunks: document.extractionCursor,
      totalChunks,
      extractedTotal: document._count.questions,
      done: true,
      error: message
    };
  }
}

/** Salva o modelo de IA dedicado à extração de referências (vazio = modelo padrão do provedor). */
export async function updateExtractionModelAction(formData: FormData) {
  const admin = await requireAdmin();
  const raw = String(formData.get("model") ?? "").trim();
  const { isValidModelId } = await import("@/lib/ai/model-catalog");
  if (raw && !isValidModelId(raw)) throw new Error("ID de modelo inválido.");

  await prisma.aiProviderSetting.upsert({
    where: { id: "default" },
    update: { extractionModel: raw || null },
    create: { id: "default", extractionModel: raw || null }
  });
  await logAdminAction(admin, {
    action: "update",
    entity: "AiProviderSetting",
    summary: `Modelo de extração: ${raw || "padrão"}`
  });
  revalidatePath("/admin/referencias");
}

export type ReclassifyResult = {
  scanned: number;
  classified: number;
  unresolved: number;
  createdSubjects: string[];
};

/**
 * Classifica retroativamente as questões extraídas que ficaram sem matéria, usando o
 * `subjectHint` que a IA JÁ gravou. Não chama IA nenhuma — é de graça.
 *
 * Existe porque durante muito tempo a matéria era copiada do documento; como uma prova de
 * concurso mistura matérias, o admin deixava o documento sem matéria e TODA questão dele
 * nascia sem classificação, quebrando a priorização por matéria na geração.
 *
 * Idempotente: só toca em questões com `subjectId` nulo, então rodar de novo não altera o
 * que já foi classificado (nem desfaz correção manual feita no admin).
 */
export async function reclassifyReferenceQuestionsAction(formData: FormData): Promise<ReclassifyResult> {
  const admin = await requireAdmin();
  const documentId = String(formData.get("documentId") ?? "") || null;

  const subjects: SubjectWithTopics[] = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, topics: { select: { id: true, name: true }, orderBy: { name: "asc" } } }
  });

  const pending = await prisma.referenceQuestion.findMany({
    where: {
      subjectId: null,
      subjectHint: { not: null },
      ...(documentId ? { documentId } : {})
    },
    select: { id: true, subjectHint: true, topicHint: true }
  });

  const createdSubjects: string[] = [];
  let classified = 0;

  for (const question of pending) {
    const subjectId = await resolveOrCreateSubjectId({ hint: question.subjectHint, subjects, createdSubjects });
    if (!subjectId) continue;
    await prisma.referenceQuestion.update({
      where: { id: question.id },
      data: { subjectId, topicId: resolveTopicId({ hint: question.topicHint, subjectId, subjects }) }
    });
    classified += 1;
  }

  await logAdminAction(admin, {
    action: "reclassify",
    entity: documentId ? "ReferenceDocument" : "ReferenceQuestion",
    entityId: documentId ?? undefined,
    summary: `${classified}/${pending.length} questões classificadas por matéria${
      createdSubjects.length ? `; matérias criadas: ${createdSubjects.join(", ")}` : ""
    }`
  });

  revalidatePath("/admin/referencias");
  if (documentId) revalidatePath(`/admin/referencias/${documentId}`);
  if (createdSubjects.length) revalidatePath("/admin/materias");

  return {
    scanned: pending.length,
    classified,
    unresolved: pending.length - classified,
    createdSubjects
  };
}

/** Corrige a matéria de UMA questão extraída (revisão manual do admin sobre o palpite da IA). */
export async function updateReferenceQuestionSubjectAction(formData: FormData) {
  const admin = await requireAdmin();
  const questionId = String(formData.get("questionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const rawSubjectId = String(formData.get("subjectId") ?? "");
  if (!questionId) return;

  // "" = limpar a classificação. Valida a matéria antes de gravar (subjectId não tem FK no schema).
  const subjectId = rawSubjectId || null;
  if (subjectId) {
    const exists = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!exists) throw new Error("Matéria não encontrada.");
  }

  await prisma.referenceQuestion.update({
    where: { id: questionId },
    // Zera o assunto: um tópico pertence a uma matéria, então manter o antigo criaria
    // uma combinação matéria/assunto inconsistente.
    data: { subjectId, topicId: null }
  });
  await logAdminAction(admin, {
    action: "update",
    entity: "ReferenceQuestion",
    entityId: questionId,
    summary: subjectId ? `Matéria ajustada manualmente` : "Matéria removida"
  });
  revalidatePath("/admin/referencias");
  if (documentId) revalidatePath(`/admin/referencias/${documentId}`);
}

/** Aplica uma matéria a TODAS as questões sem classificação de um documento. */
export async function bulkAssignSubjectAction(formData: FormData) {
  const admin = await requireAdmin();
  const documentId = String(formData.get("documentId") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");
  if (!documentId || !subjectId) return;

  const exists = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
  if (!exists) throw new Error("Matéria não encontrada.");

  const { count } = await prisma.referenceQuestion.updateMany({
    where: { documentId, subjectId: null },
    data: { subjectId }
  });
  await logAdminAction(admin, {
    action: "update",
    entity: "ReferenceDocument",
    entityId: documentId,
    summary: `${count} questões sem matéria atribuídas a ${exists.name}`
  });
  revalidatePath("/admin/referencias");
  revalidatePath(`/admin/referencias/${documentId}`);
}

/** Zera a extração (apaga questões extraídas e volta o cursor) para reprocessar. */
export async function resetExtractionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.$transaction([
    prisma.referenceQuestion.deleteMany({ where: { documentId: id } }),
    prisma.referenceDocument.update({
      where: { id },
      data: { extractionCursor: 0, extractionStatus: ReferenceExtractionStatus.PENDING, extractionError: null }
    })
  ]);
  await logAdminAction(admin, { action: "reset_extraction", entity: "ReferenceDocument", entityId: id });
  revalidatePath("/admin/referencias");
}
