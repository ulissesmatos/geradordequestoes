"use server";

import { ReferenceKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
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
  await prisma.referenceDocument.delete({ where: { id } }); // cascade remove os chunks
  await logAdminAction(admin, { action: "delete", entity: "ReferenceDocument", entityId: id });
  revalidatePath("/admin/referencias");
}
