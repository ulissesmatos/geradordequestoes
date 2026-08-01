import { cleanExtractedText } from "@/lib/sanitize";
import { put } from "@vercel/blob";
import { getEntitlements, upgradeRequiredResponse } from "@/lib/entitlements";
import { requireUser } from "@/lib/guards";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { ATTACHMENT_LIMITS, attachmentKindFromMime } from "@/lib/uploads";

export const runtime = "nodejs";

const IMAGE_MAX_PX = 1280;
const IMAGE_QUALITY = 80;

type SharpFactory = typeof import("sharp");

function hasAsciiAt(buffer: Buffer, offset: number, value: string) {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

function isSupportedImageBytes(buffer: Buffer, mime: string) {
  if (mime === "image/png") {
    return buffer.length >= 8 && buffer[0] === 0x89 && hasAsciiAt(buffer, 1, "PNG\r\n\x1a\n");
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/webp") {
    return buffer.length >= 12 && hasAsciiAt(buffer, 0, "RIFF") && hasAsciiAt(buffer, 8, "WEBP");
  }
  if (mime === "image/gif") {
    return hasAsciiAt(buffer, 0, "GIF87a") || hasAsciiAt(buffer, 0, "GIF89a");
  }
  return false;
}

async function compressImage(buffer: Buffer): Promise<Buffer | null> {
  let sharp: SharpFactory;
  try {
    // PDF upload must not depend on this native module. Loading sharp only in the
    // image path avoids breaking /api/uploads entirely when libvips is missing.
    const sharpModule = (await import("sharp")) as unknown as { default?: SharpFactory };
    sharp = sharpModule.default ?? (sharpModule as unknown as SharpFactory);
  } catch (error) {
    console.error("[uploads] sharp indisponível; salvando imagem original.", error);
    return null;
  }

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
    // PDF ruim traz NUL e outros controles; sem limpar aqui o byte viaja para o prompt,
    // volta ecoado na resposta do modelo e derruba a gravação no Postgres.
    return cleanExtractedText(merged).trim().slice(0, 20_000);
  } catch (error) {
    console.error("[uploads] falha ao extrair texto do PDF.", error);
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // Gate de plano ANTES do rate limit e do processamento: anexo custa visão, extração e
    // storage. Só barrar na UI não adiantaria — esta rota é chamável direto.
    const entitlements = await getEntitlements(user);
    if (!entitlements.can("chatAttachments")) {
      return upgradeRequiredResponse(
        "chatAttachments",
        "Enviar arquivos no chat está disponível nos planos pagos. Assine para gerar questões a partir do seu próprio material."
      );
    }

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
      if (!isSupportedImageBytes(rawBuffer, file.type)) {
        return Response.json(
          { error: "O arquivo não parece ser uma imagem válida. Envie um PNG, JPG, WEBP ou GIF." },
          { status: 422 }
        );
      }

      let compressed: Buffer | null;
      try {
        compressed = await compressImage(rawBuffer);
      } catch (error) {
        console.error("[uploads] falha ao processar imagem.", error);
        return Response.json(
          { error: "Não foi possível processar a imagem. Envie um PNG, JPG, WEBP ou GIF válido." },
          { status: 422 }
        );
      }

      const imageBuffer = compressed ?? rawBuffer;
      const imageName = compressed ? `${baseName}.webp` : safeName;
      const imageMimeType = compressed ? "image/webp" : file.type;
      const blob = await put(`chat/${imageName}`, imageBuffer, {
        access: "private",
        addRandomSuffix: true,
        contentType: imageMimeType
      });

      return Response.json({
        url: blob.url,
        kind,
        name: imageName,
        mimeType: imageMimeType,
        size: imageBuffer.length,
        originalSize: file.size
      });
    }

    // PDF: salva apenas o texto extraído (ínfima fração do tamanho do PDF original)
    const extractedText = await extractPdfText(new Uint8Array(rawBuffer));
    if (!extractedText) {
      return Response.json(
        {
          error:
            "Não consegui extrair texto desse PDF. Envie um PDF com texto selecionável ou cole o conteúdo no chat."
        },
        { status: 422 }
      );
    }

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
