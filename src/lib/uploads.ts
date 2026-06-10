export const ATTACHMENT_LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxMb: 4,
  maxPerMessage: 6
};

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export type AttachmentKindValue = "IMAGE" | "PDF";

export function attachmentKindFromMime(mime: string): AttachmentKindValue | null {
  if (IMAGE_MIMES.includes(mime)) return "IMAGE";
  if (mime === "application/pdf") return "PDF";
  return null;
}

export const ATTACHMENT_ACCEPT = [...IMAGE_MIMES, "application/pdf"].join(",");

export type UploadedAttachment = {
  url: string;
  kind: AttachmentKindValue;
  name: string;
  mimeType: string;
  size: number;
  extractedText?: string;
};
