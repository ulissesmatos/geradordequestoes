"use server";

import { ReferenceExtractionStatus, ReferenceKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { extractReferenceQuestions } from "@/lib/ai/extract-reference";
import { logAdminAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { ingestReferenceDocument } from "@/lib/reference";

async function extractPdfText(file: File): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    return merged.trim();
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
 * Chunks (~1000 chars) processados por chamada de IA. Lote menor = menos questões
 * por resposta, reduzindo o risco de o JSON de saída ser truncado pelo limite de
 * tokens (sobretudo no Claude, que pode serializar o array como string escapada).
 */
const CHUNKS_PER_BATCH = 5;

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

    // Lote atual + uma cauda do lote anterior (overlap) para não perder questões na fronteira.
    const from = Math.max(0, document.extractionCursor - 1);
    const chunks = await prisma.referenceChunk.findMany({
      where: { documentId: document.id, ordinal: { gte: from, lt: document.extractionCursor + CHUNKS_PER_BATCH } },
      orderBy: { ordinal: "asc" },
      select: { content: true }
    });
    const text = chunks.map((c) => c.content).join("\n\n");

    const extraction = text.trim() ? await extractReferenceQuestions(text) : { questions: [], model: "", provider: null };
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

    await prisma.$transaction([
      ...(fresh.length
        ? [
            prisma.referenceQuestion.createMany({
              data: fresh.map((q, i) => ({
                documentId: document.id,
                subjectId: document.subjectId,
                topicId: document.topicId,
                statement: q.statement,
                answer: q.answer,
                answerText: q.answerText,
                explanation: q.explanation,
                trickNote: q.trickNote,
                hasImage: q.hasImage,
                imageDescription: q.imageDescription,
                topicHint: q.topicHint,
                ordinal: existing.length + i
              }))
            })
          ]
        : []),
      prisma.referenceDocument.update({
        where: { id: document.id },
        data: {
          extractionCursor: nextCursor,
          extractionStatus: isDone ? ReferenceExtractionStatus.DONE : ReferenceExtractionStatus.PROCESSING
        }
      })
    ]);

    if (isDone) {
      await logAdminAction(admin, {
        action: "extract",
        entity: "ReferenceDocument",
        entityId: document.id,
        summary: `${document.title}: ${existing.length + fresh.length} questões extraídas (modelo: ${extraction.model || "padrão"})`
      });
      revalidatePath("/admin/referencias");
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
