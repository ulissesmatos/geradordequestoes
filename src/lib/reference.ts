import { Prisma, type QuestionAnswer, type ReferenceKind } from "@prisma/client";
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

export type ReferenceQuestionHit = {
  id: string;
  documentId: string;
  statement: string;
  answer: QuestionAnswer | null;
  answerText: string | null;
  explanation: string | null;
  trickNote: string | null;
  hasImage: boolean;
  imageDescription: string | null;
  topicHint: string | null;
  title: string;
  source: string | null;
};

/**
 * Busca QUESTÕES estruturadas extraídas por IA dos materiais (banco refinado).
 * Muito mais preciso e barato que vasculhar chunks crus: gabarito, justificativa
 * e pegadinha já vêm mapeados.
 */
export async function searchReferenceQuestions(input: {
  query: string;
  subjectId?: string | null;
  topicId?: string | null;
  limit?: number;
}): Promise<ReferenceQuestionHit[]> {
  const query = (input.query ?? "").trim();
  if (!query) return [];
  // Teto mais alto que o de searchReferenceChunks: o modo "variação fiel" pode pedir
  // até uma questão de referência por item do lote (self-serve e simulados admin).
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 30);

  const filters: Prisma.Sql[] = [
    Prisma.sql`to_tsvector('portuguese', q.statement || ' ' || coalesce(q.explanation, '') || ' ' || coalesce(q."topicHint", '')) @@ plainto_tsquery('portuguese', ${query})`
  ];
  if (input.subjectId) filters.push(Prisma.sql`q."subjectId" = ${input.subjectId}`);
  if (input.topicId) filters.push(Prisma.sql`q."topicId" = ${input.topicId}`);
  const where = Prisma.join(filters, " AND ");

  return prisma.$queryRaw<ReferenceQuestionHit[]>(Prisma.sql`
    SELECT q.id, q."documentId", q.statement, q.answer, q."answerText", q.explanation,
           q."trickNote", q."hasImage", q."imageDescription", q."topicHint",
           d.title, d.source
    FROM "ReferenceQuestion" q
    JOIN "ReferenceDocument" d ON d.id = q."documentId"
    WHERE ${where}
    ORDER BY ts_rank(
      to_tsvector('portuguese', q.statement || ' ' || coalesce(q.explanation, '')),
      plainto_tsquery('portuguese', ${query})
    ) DESC
    LIMIT ${limit}
  `);
}

/**
 * Catálogo curto dos materiais de referência disponíveis, para o system prompt.
 * Assim a IA SABE o que existe no acervo interno e pode listar/responder
 * "quais materiais você tem" sem precisar adivinhar uma busca por palavra-chave.
 */
export async function getReferenceCatalog(): Promise<string> {
  const documents = await prisma.referenceDocument.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      title: true,
      source: true,
      kind: true,
      _count: { select: { questions: true } }
    }
  });
  if (documents.length === 0) return "";

  const lines = documents.map((doc) => {
    const meta = [doc.source, doc._count.questions ? `${doc._count.questions} questões` : null].filter(Boolean).join(", ");
    return `- ${doc.title} (${doc.kind}${meta ? `; ${meta}` : ""})`;
  });
  return lines.join("\n");
}

/** Formata uma questão extraída como texto de contexto/exemplar para prompts. */
export function formatReferenceQuestion(question: ReferenceQuestionHit): string {
  const gabarito = question.answer ?? question.answerText ?? "desconhecido";
  return [
    `Questão real (${question.title}${question.source ? ` — ${question.source}` : ""}) [gabarito: ${gabarito}]`,
    question.statement,
    question.explanation ? `Justificativa: ${question.explanation}` : "",
    question.trickNote ? `Pegadinha: ${question.trickNote}` : "",
    question.hasImage ? `Atenção: a questão original depende de imagem/charge${question.imageDescription ? ` (${question.imageDescription})` : ""}.` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Trechos de referência para fundamentar a GERAÇÃO de questões. Prioriza as
 * QUESTÕES estruturadas extraídas por IA (exemplares com gabarito conferido);
 * recai para full-text nos trechos crus e, por fim, trechos da matéria/assunto.
 *
 * Filtro suave: se subjectId/topicId não casar (ex.: material sem matéria atribuída),
 * refaz sem filtro — ts_rank mantém os on-topic no topo de qualquer forma.
 *
 * Retorna `usedStructuredQuestions: true` apenas quando o Tier 1 (questões extraídas)
 * casou — é o sinal de "havia prova real cadastrada".
 */
export async function getReferenceContext(input: {
  subjectId?: string | null;
  topicId?: string | null;
  query?: string;
  limit?: number;
}): Promise<{ hits: ReferenceHit[]; usedStructuredQuestions: boolean }> {
  const limit = input.limit ?? 4;

  // 1) Banco estruturado: questões extraídas por IA, com gabarito mapeado.
  if (input.query && input.query.trim()) {
    let questionHits = await searchReferenceQuestions({
      query: input.query,
      subjectId: input.subjectId,
      topicId: input.topicId,
      limit
    });
    if (questionHits.length === 0 && (input.subjectId || input.topicId)) {
      questionHits = await searchReferenceQuestions({ query: input.query, limit });
    }
    if (questionHits.length) {
      return {
        hits: questionHits.map((q) => ({
          id: q.id,
          documentId: q.documentId,
          content: formatReferenceQuestion(q),
          title: q.title,
          source: q.source
        })),
        usedStructuredQuestions: true
      };
    }
  }

  // 2) Fallback: full-text nos trechos crus.
  if (input.query && input.query.trim()) {
    let hits = await searchReferenceChunks({
      query: input.query,
      subjectId: input.subjectId,
      topicId: input.topicId,
      limit
    });
    if (hits.length === 0 && (input.subjectId || input.topicId)) {
      hits = await searchReferenceChunks({ query: input.query, limit });
    }
    if (hits.length) return { hits, usedStructuredQuestions: false };
  }
  if (!input.subjectId && !input.topicId) return { hits: [], usedStructuredQuestions: false };
  const chunks = await prisma.referenceChunk.findMany({
    where: {
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { document: { select: { title: true, source: true } } }
  });
  return {
    hits: chunks.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      content: c.content,
      title: c.document.title,
      source: c.document.source
    })),
    usedStructuredQuestions: false
  };
}

/** Formata trechos como bloco de contexto para o prompt de geração. */
export function formatReferenceContext(hits: ReferenceHit[]): string {
  if (hits.length === 0) return "";
  const body = hits
    .map((h, i) => `[Referência ${i + 1}${h.source ? ` — ${h.source}` : ""}: ${h.title}]\n${h.content}`)
    .join("\n\n");
  return `Material de referência real (provas/gabaritos/leis cadastrados). Baseie as questões NESTE material, mantendo o estilo e CONFERINDO o gabarito contra ele:\n${body}`;
}
