import { AttachmentKind } from "@prisma/client";
import { z } from "zod";
import { ATTACHMENT_LIMITS } from "@/lib/uploads";

export const attachmentSchema = z.object({
  kind: z.nativeEnum(AttachmentKind),
  url: z.string().url(),
  name: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
  extractedText: z.string().max(20000).optional()
});

export type ChatAttachmentInput = z.infer<typeof attachmentSchema>;

/** Aceita string JSON (FormData) ou um valor já desserializado e devolve anexos válidos. */
export function parseAttachments(raw: unknown): ChatAttachmentInput[] {
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
  const parsed = z.array(attachmentSchema).max(ATTACHMENT_LIMITS.maxPerMessage).safeParse(value);
  return parsed.success ? parsed.data : [];
}
