import { Prisma, type ReferenceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CHUNK_TARGET = 1000;
const CHUNK_OVERLAP = 150;

export type ReferenceHit = {
  id: string;
  documentId: string;
  content: string;
  title: string;
  source: string | null;
};

/** Quebra um texto longo em trechos (~1000 chars) com leve sobreposição, respeitando parágrafos. */
export function chunkText(raw: string): string[] {
  const text = (raw ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const piece = para.trim();
    if (!piece) continue;
    if ((current + "\n\n" + piece).length <= CHUNK_TARGET) {
      current = current ? `${current}\n\n${piece}` : piece;
    } else {
      if (current) chunks.push(current);
      if (piece.length <= CHUNK_TARGET) {
        // Inicia o próximo com uma cauda do anterior (overlap).
        const tail = current.slice(-CHUNK_OVERLAP);
        current = tail ? `${tail}\n\n${piece}` : piece;
      } else {
        // Parágrafo gigante: fatiamento por janela.
        for (let i = 0; i < piece.length; i += CHUNK_TARGET - CHUNK_OVERLAP) {
          chunks.push(piece.slice(i, i + CHUNK_TARGET));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

/** Cria um documento de referência e seus chunks (indexáveis por full-text). */
export async function ingestReferenceDocument(input: {
  title: string;
  source?: string | null;
  kind: ReferenceKind;
  subjectId?: string | null;
  topicId?: string | null;
  createdById?: string | null;
  text: string;
}): Promise<{ documentId: string; chunks: number }> {
  const chunks = chunkText(input.text);
  const document = await prisma.referenceDocument.create({
    data: {
      title: input.title,
      source: input.source || null,
      kind: input.kind,
      subjectId: input.subjectId || null,
      topicId: input.topicId || null,
      createdById: input.createdById || null
    }
  });
  if (chunks.length > 0) {
    await prisma.referenceChunk.createMany({
      data: chunks.map((content, ordinal) => ({
        documentId: document.id,
        subjectId: input.subjectId || null,
        topicId: input.topicId || null,
        content,
        ordinal
      }))
    });
  }
  return { documentId: document.id, chunks: chunks.length };
}

/** Busca trechos por full-text (português), com filtro opcional por matéria/assunto. */
export async function searchReferenceChunks(input: {
  query: string;
  subjectId?: string | null;
  topicId?: string | null;
  limit?: number;
}): Promise<ReferenceHit[]> {
  const query = (input.query ?? "").trim();
  if (!query) return [];
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 12);

  const filters: Prisma.Sql[] = [
    Prisma.sql`to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', ${query})`
  ];
  if (input.subjectId) filters.push(Prisma.sql`c."subjectId" = ${input.subjectId}`);
  if (input.topicId) filters.push(Prisma.sql`c."topicId" = ${input.topicId}`);
  const where = Prisma.join(filters, " AND ");

  return prisma.$queryRaw<ReferenceHit[]>(Prisma.sql`
    SELECT c.id, c."documentId", c.content, d.title, d.source
    FROM "ReferenceChunk" c
    JOIN "ReferenceDocument" d ON d.id = c."documentId"
    WHERE ${where}
    ORDER BY ts_rank(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', ${query})) DESC
    LIMIT ${limit}
  `);
}

/**
 * Trechos de referência para fundamentar a GERAÇÃO de questões. Tenta full-text
 * pelo tema; se não houver match (ou sem query), recai para os trechos da
 * matéria/assunto. Vazio quando não há material cadastrado.
 */
export async function getReferenceContext(input: {
  subjectId?: string | null;
  topicId?: string | null;
  query?: string;
  limit?: number;
}): Promise<ReferenceHit[]> {
  const limit = input.limit ?? 4;
  if (input.query && input.query.trim()) {
    const hits = await searchReferenceChunks({
      query: input.query,
      subjectId: input.subjectId,
      topicId: input.topicId,
      limit
    });
    if (hits.length) return hits;
  }
  if (!input.subjectId && !input.topicId) return [];
  const chunks = await prisma.referenceChunk.findMany({
    where: {
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { document: { select: { title: true, source: true } } }
  });
  return chunks.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    content: c.content,
    title: c.document.title,
    source: c.document.source
  }));
}

/** Formata trechos como bloco de contexto para o prompt de geração. */
export function formatReferenceContext(hits: ReferenceHit[]): string {
  if (hits.length === 0) return "";
  const body = hits
    .map((h, i) => `[Referência ${i + 1}${h.source ? ` — ${h.source}` : ""}: ${h.title}]\n${h.content}`)
    .join("\n\n");
  return `Material de referência real (provas/gabaritos/leis cadastrados). Baseie as questões NESTE material, mantendo o estilo e CONFERINDO o gabarito contra ele:\n${body}`;
}
