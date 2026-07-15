import sharp from "sharp";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/guards";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { ATTACHMENT_LIMITS, attachmentKindFromMime } from "@/lib/uploads";

export const runtime = "nodejs";

const IMAGE_MAX_PX = 1280;
const IMAGE_QUALITY = 80;

async function compressImage(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const needsResize = (meta.width ?? 0) > IMAGE_MAX_PX || (meta.height ?? 0) > IMAGE_MAX_PX;

  const pipeline = sharp(buffer, { animated: false });
  if (needsResize) {
    pipeline.resize(IMAGE_MAX_PX, IMAGE_MAX_PX, { fit: "inside", withoutEnlargement: true });
  }
  return pipeline.webp({ quality: IMAGE_QUALITY }).toBuffer();
}

async function extractPdfText(buffer: Uint8Array): Promise<string> {
  try {
    // Dynamic import keeps pdfjs-dist out of the main bundle — it crashes at module
    // init when bundled by webpack due to its worker setup.
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    return merged.trim().slice(0, 20_000);
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads);
    if (!rate.ok) {
      return Response.json(
        { error: "Muitos uploads em sequência. Aguarde um pouco e tente de novo." },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } }
      );
    }

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

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "arquivo";
    const baseName = safeName.replace(/\.[^.]+$/, "");

    if (kind === "IMAGE") {
      const compressed = await compressImage(rawBuffer);
      const blob = await put(`chat/${baseName}.webp`, compressed, {
        access: "private",
        addRandomSuffix: true,
        contentType: "image/webp"
      });

      return Response.json({
        url: blob.url,
        kind,
        name: `${baseName}.webp`,
        mimeType: "image/webp",
        size: compressed.length,
        originalSize: file.size
      });
    }

    // PDF: salva apenas o texto extraído (ínfima fração do tamanho do PDF original)
    const extractedText = await extractPdfText(new Uint8Array(rawBuffer));
    const textBytes = Buffer.from(extractedText, "utf8");
    const blob = await put(`chat/${baseName}.txt`, textBytes, {
      access: "private",
      addRandomSuffix: true,
      contentType: "text/plain; charset=utf-8"
    });

    return Response.json({
      url: blob.url,
      kind,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      extractedText: extractedText || undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno no upload.";
    return Response.json({ error: message }, { status: 500 });
  }
}
