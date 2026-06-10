import { put } from "@vercel/blob";
import { extractText, getDocumentProxy } from "unpdf";
import { requireUser } from "@/lib/guards";
import { ATTACHMENT_LIMITS, attachmentKindFromMime } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireUser();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Uploads não estão configurados. Defina BLOB_READ_WRITE_TOKEN (Vercel Blob)." },
      { status: 501 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  }

  const kind = attachmentKindFromMime(file.type);
  if (!kind) {
    return Response.json(
      { error: "Tipo de arquivo não suportado. Envie imagem (PNG, JPG, WEBP, GIF) ou PDF." },
      { status: 415 }
    );
  }
  if (file.size > ATTACHMENT_LIMITS.maxBytes) {
    return Response.json({ error: `Arquivo muito grande (máx. ${ATTACHMENT_LIMITS.maxMb}MB).` }, { status: 413 });
  }

  let extractedText: string | undefined;
  if (kind === "PDF") {
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      const merged = Array.isArray(text) ? text.join("\n") : text;
      extractedText = merged.trim().slice(0, 20000) || undefined;
    } catch {
      extractedText = undefined;
    }
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "arquivo";
  const blob = await put(`chat/${safeName}`, file, { access: "public", addRandomSuffix: true });

  return Response.json({
    url: blob.url,
    kind,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    extractedText
  });
}
