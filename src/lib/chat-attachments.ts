import { AttachmentKind } from "@prisma/client";
import { z } from "zod";
import { cleanExtractedText } from "@/lib/sanitize";
import { ATTACHMENT_LIMITS, attachmentKindFromMime } from "@/lib/uploads";

/**
 * Validação de anexos do chat NA ORIGEM.
 *
 * O que chega do navegador é só um JSON — `{ url, kind, name, mimeType, size,
 * extractedText }` — montado a partir da resposta de /api/uploads. Validar apenas o
 * formato desse JSON (era o que fazíamos) deixava dois furos:
 *
 * 1. `extractedText` vinha do cliente e ia direto para o contexto do modelo. Dava para
 *    pular o upload inteiro e injetar 20 mil caracteres arbitrários no prompt — sem
 *    passar por rate limit, sem limite de tamanho de arquivo e sem gate de plano.
 * 2. `url` podia apontar para qualquer lugar, virando um pedido de fetch nosso para um
 *    host de terceiro.
 *
 * A correção se apoia num detalhe do upload: para PDF, o blob gravado JÁ É o texto
 * extraído (ver src/app/(app)/api/uploads/route.ts). Então o servidor relê o texto da
 * origem e simplesmente ignora o que o cliente mandou. Com a URL obrigatoriamente
 * dentro do nosso storage, não existe anexo que não tenha passado por /api/uploads.
 */

export const attachmentSchema = z.object({
  kind: z.nativeEnum(AttachmentKind),
  url: z.string().url(),
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
  // Aceito no schema por compatibilidade com o payload do cliente, mas DESCARTADO:
  // o texto autoritativo é relido do blob em resolveAttachments.
  extractedText: z.string().max(20000).optional()
});

export type ChatAttachmentInput = z.infer<typeof attachmentSchema>;

/** Host do Vercel Blob — mesmo recorte que /api/uploads/proxy usa contra SSRF. */
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

function isOwnBlobUrl(raw: string): boolean {
  try {
    return new URL(raw).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Aceita string JSON (FormData) ou valor já desserializado; devolve o que passar no formato. */
function parseShape(raw: unknown): ChatAttachmentInput[] {
  let value = raw;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value == null) return [];
  const parsed = z.array(attachmentSchema).safeParse(value);
  // Corta o excedente em vez de validar `.max()` no array: com `.max()`, mandar 7 anexos
  // reprovava a lista inteira e a mensagem seguia com ZERO — pior do que ficar com 6.
  return parsed.success ? parsed.data.slice(0, ATTACHMENT_LIMITS.maxPerMessage) : [];
}

/**
 * Lê do blob o texto extraído de um PDF no momento do upload.
 *
 * Devolve "" em qualquer falha (blob sumiu, token ausente, content-type inesperado):
 * anexo sem texto é degradação aceitável; texto de origem duvidosa, não.
 */
async function fetchExtractedText(url: string): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return "";
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return "";
    // O upload grava o texto do PDF como text/plain. Outro content-type significa que a
    // URL aponta para outro anexo (ex.: a imagem .webp de outra mensagem) — não é o texto
    // que este anexo diz carregar.
    if (!(response.headers.get("Content-Type") ?? "").startsWith("text/plain")) return "";
    return cleanExtractedText(await response.text()).trim().slice(0, 20_000);
  } catch {
    return "";
  }
}

/**
 * Anexos prontos para gravar: formato validado, origem conferida e texto relido da fonte.
 * Anexo que não passa é descartado em silêncio — o turno segue com os que sobraram.
 */
export async function resolveAttachments(raw: unknown): Promise<ChatAttachmentInput[]> {
  const candidates = parseShape(raw).filter((attachment) => {
    if (!isOwnBlobUrl(attachment.url)) return false;
    if (attachment.size > ATTACHMENT_LIMITS.maxBytes) return false;
    // `kind` precisa bater com o mimeType declarado: sem isso um .webp podia se
    // apresentar como PDF (e vice-versa) para escapar do tratamento correto.
    return attachmentKindFromMime(attachment.mimeType) === attachment.kind;
  });

  return Promise.all(
    candidates.map(async (attachment) => {
      if (attachment.kind !== AttachmentKind.PDF) {
        return { ...attachment, extractedText: undefined };
      }
      const extractedText = await fetchExtractedText(attachment.url);
      return { ...attachment, extractedText: extractedText || undefined };
    })
  );
}
