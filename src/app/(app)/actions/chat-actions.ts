"use server";

import { AiChatRole, AiUsageEventStatus, AiUsageEventType, type Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFriendlyAiError } from "@/lib/ai/chat/errors";
import { runChatTurn, summarizeSessionIfNeeded } from "@/lib/ai/chat/runner";
import { getOrCreateChatSession } from "@/lib/ai/chat/sessions";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import { parseAttachments } from "@/lib/chat-attachments";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

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
  const attachments = parseAttachments(formData.get("attachments"));
  if (!prompt && attachments.length === 0) return { error: "Digite uma mensagem." };

  let session: { id: string } | null = null;
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
          extractedText: attachment.extractedText
        }))
      });
    }

    await assertCanGenerateWithAi(user);
    const turn = await runChatTurn({ user, sessionId: session.id, prompt });

    const assistant = await prisma.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: AiChatRole.ASSISTANT,
        content: turn.message,
        questionSetId: turn.questionSetId,
        studyMaterialId: turn.studyMaterialId,
        metadata: turn.toolTrace.length
          ? ({ toolCalls: turn.toolTrace } as unknown as Prisma.InputJsonValue)
          : undefined
      }
    });

    await recordAiUsageEvent({
      user,
      type: AiUsageEventType.CHAT_RESPONSE,
      model: turn.model,
      prompt
    });
    await summarizeSessionIfNeeded(session.id).catch(() => undefined);

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
    await recordAiUsageEvent({
      user,
      type: AiUsageEventType.CHAT_RESPONSE,
      status: AiUsageEventStatus.ERROR,
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
