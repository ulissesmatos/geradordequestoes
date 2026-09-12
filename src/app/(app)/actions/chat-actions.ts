"use server";

import { AiChatRole, type Prisma, TrialUsageKind, UsageKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFriendlyAiError } from "@/lib/ai/chat/errors";
import { runChatTurn, summarizeSessionIfNeeded } from "@/lib/ai/chat/runner";
import { generateSessionTitle, getOrCreateChatSession } from "@/lib/ai/chat/sessions";
import { chargeAiAction, recordAiGenerationLog, refundAiAction, type AiActionCharge } from "@/lib/ai/usage";
import { stripNullBytes, stripNullBytesNullable } from "@/lib/sanitize";
import {
  cloneSharedChatSession,
  createOrReactivateChatShare,
  revokeChatShare,
  type CloneChatResult,
  type RevokeActionResult,
  type ShareActionResult
} from "@/lib/chat-share";
import { resolveAttachments } from "@/lib/chat-attachments";
import { getEntitlements } from "@/lib/entitlements";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export type ChatActionState = {
  ok?: boolean;
  questionSetId?: string;
  studyMaterialId?: string;
  sessionId?: string;
  messageId?: string;
  message?: string;
  error?: string;
};

export async function sendChatMessageAction(
  _: ChatActionState | null,
  formData: FormData
): Promise<ChatActionState> {
  const user = await requireUser();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "");
  const attachments = await resolveAttachments(formData.get("attachments"));
  if (!prompt && attachments.length === 0) return { error: "Digite uma mensagem." };

  // Segundo gate, além do de /api/uploads: um anexo pode chegar aqui de uma requisição
  // forjada ou de um plano que mudou no meio da sessão. Falha alto em vez de ignorar em
  // silêncio — o usuário anexou um arquivo e precisa saber que ele não foi usado.
  if (attachments.length > 0 && !(await getEntitlements(user)).can("chatAttachments")) {
    return {
      error:
        "Enviar arquivos no chat está disponível nos planos pagos. Assine para gerar questões a partir do seu próprio material."
    };
  }

  let session: { id: string } | null = null;
  // Cobrado na entrada e estornado se o turno falhar.
  let charge: AiActionCharge | null = null;
  try {
    session = await getOrCreateChatSession(user.id, prompt || "Anexo enviado", sessionId || undefined);
    const userMessage = await prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: AiChatRole.USER, content: prompt }
    });
    if (attachments.length) {
      await prisma.aiChatMessageAttachment.createMany({
        data: attachments.map((attachment) => ({
          messageId: userMessage.id,
          kind: attachment.kind,
          url: attachment.url,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          // Já vem relido do blob e limpo por resolveAttachments; o strip aqui é a última
          // barreira contra NUL, que o Postgres rejeita em coluna text.
          extractedText: stripNullBytesNullable(attachment.extractedText)
        }))
      });
    }

    // 1 mensagem = 1 unidade do medidor CHAT, independente das chamadas de LLM internas do
    // turno. As questões que este turno eventualmente gerar são cobradas à parte, no medidor
    // QUESTIONS, dentro de generateAndSaveQuestionSet — medidores diferentes, sem dupla
    // cobrança da mesma mensagem.
    charge = await chargeAiAction({ user, kind: TrialUsageKind.CHAT_MESSAGE, ledgerKind: UsageKind.CHAT_MESSAGE });

    // Título da conversa em paralelo ao turno (ver generateSessionTitle): pô-lo na frente
    // atrasaria a resposta de todo chat novo para melhorar um texto da barra lateral.
    const titlePromise = generateSessionTitle(session.id, prompt).catch(() => undefined);
    const turn = await runChatTurn({ user, sessionId: session.id, prompt });

    const assistant = await prisma.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: AiChatRole.ASSISTANT,
        content: stripNullBytes(turn.message),
        questionSetId: turn.questionSetId,
        studyMaterialId: turn.studyMaterialId,
        metadata: turn.toolTrace.length
          ? ({ toolCalls: turn.toolTrace } as unknown as Prisma.InputJsonValue)
          : undefined
      }
    });

    await recordAiGenerationLog({
      user,
      kind: UsageKind.CHAT_MESSAGE,
      model: turn.model,
      prompt
    });
    await summarizeSessionIfNeeded(session.id).catch(() => undefined);
    await titlePromise;

    revalidatePath("/ai");
    if (turn.questionSetId) revalidatePath("/biblioteca");
    if (turn.studyMaterialId) revalidatePath("/materiais");

    return {
      ok: true,
      sessionId: session.id,
      messageId: assistant.id,
      message: turn.message,
      questionSetId: turn.questionSetId,
      studyMaterialId: turn.studyMaterialId
    };
  } catch (error) {
    // Turno não entregou resultado: devolve a unidade cobrada na entrada.
    await refundAiAction(charge);
    await recordAiGenerationLog({
      user,
      kind: UsageKind.CHAT_MESSAGE,
      status: "ERROR",
      prompt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
    }).catch(() => undefined);
    return { error: toFriendlyAiError(error), sessionId: session?.id };
  }
}

export async function renameChatSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (!title) return;

  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: { title }
  });
  revalidatePath("/ai");
}

export async function deleteChatSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  const isActive = formData.get("isActive") === "true";

  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true }
  });
  if (!session) return;

  await prisma.$transaction([
    prisma.questionSet.updateMany({
      where: { chatSessionId: session.id, userId: user.id },
      data: { chatSessionId: null }
    }),
    prisma.aiChatSession.delete({
      where: { id: session.id }
    })
  ]);

  revalidatePath("/ai");
  revalidatePath("/biblioteca");

  if (isActive) redirect("/ai?new=1");
}

/**
 * Sem FormData de propósito: chamadas diretamente pelo ShareLinkModal via
 * `.bind(null, sessionId)` no server component que o renderiza.
 */
export async function shareChatSessionAction(sessionId: string): Promise<ShareActionResult> {
  const user = await requireUser();
  const result = await createOrReactivateChatShare(user.id, sessionId);
  if (result.ok) revalidatePath("/ai");
  return result;
}

export async function revokeChatShareAction(sessionId: string): Promise<RevokeActionResult> {
  const user = await requireUser();
  const result = await revokeChatShare(user.id, sessionId);
  if (result.ok) revalidatePath("/ai");
  return result;
}

/** Chamada pelo botão "Continuar esta conversa" na página pública /c/[shareId]. */
export async function cloneSharedChatAction(shareId: string): Promise<CloneChatResult> {
  const user = await requireUser();
  const result = await cloneSharedChatSession(user, shareId);
  if (result.ok) revalidatePath("/ai");
  return result;
}
