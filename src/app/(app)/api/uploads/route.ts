import { put } from "@vercel/blob";
import { requireUser } from "@/lib/guards";
import { ATTACHMENT_LIMITS, attachmentKindFromMime } from "@/lib/uploads";

export const runtime = "nodejs";

async function extractPdfText(file: File): Promise<string | undefined> {
  try {
    // Dynamic import keeps pdfjs-dist out of the main bundle — it crashes at module
    // init when bundled by webpack due to its worker setup.
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    return merged.trim().slice(0, 20000) || undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
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

    const extractedText = kind === "PDF" ? await extractPdfText(file) : undefined;

    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "arquivo";
    const blob = await put(`chat/${safeName}`, file, { access: "private", addRandomSuffix: true });

    return Response.json({
      url: blob.url,
      kind,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      extractedText
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno no upload.";
    return Response.json({ error: message }, { status: 500 });
  }
}
