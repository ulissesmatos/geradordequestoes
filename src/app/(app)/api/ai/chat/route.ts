import { AiChatRole, AiUsageEventStatus, AiUsageEventType, type Prisma, TrialUsageKind, UsageKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { toFriendlyAiError } from "@/lib/ai/chat/errors";
import { streamChatTurn, summarizeSessionIfNeeded } from "@/lib/ai/chat/runner";
import { getOrCreateChatSession } from "@/lib/ai/chat/sessions";
import { chargeAiAction, recordAiUsageEvent, refundAiAction, type AiActionCharge } from "@/lib/ai/usage";
import { stripNullBytes, stripNullBytesNullable } from "@/lib/sanitize";
import { resolveAttachments } from "@/lib/chat-attachments";
import { getEntitlements, upgradeRequiredResponse } from "@/lib/entitlements";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();

  const rate = checkRateLimit(`chat:${user.id}`, RATE_LIMITS.aiChat);
  if (!rate.ok) {
    return Response.json(
      { error: "Muitas mensagens em sequência. Aguarde alguns segundos e tente de novo." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? "").trim();
  const sessionId = String(body?.sessionId ?? "");
  const attachments = await resolveAttachments(body?.attachments);
  if (!prompt && attachments.length === 0) {
    return Response.json({ error: "Digite uma mensagem." }, { status: 400 });
  }

  // Segundo gate, além do de /api/uploads: um anexo pode chegar aqui de uma requisição
  // forjada ou de um plano que mudou no meio da sessão. Barra antes de abrir o stream.
  if (attachments.length > 0 && !(await getEntitlements(user)).can("chatAttachments")) {
    return upgradeRequiredResponse(
      "chatAttachments",
      "Enviar arquivos no chat está disponível nos planos pagos. Assine para gerar questões a partir do seu próprio material."
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let session: { id: string } | null = null;
      // Cobrado na entrada e estornado se o turno falhar (ver chargeAiAction).
      let charge: AiActionCharge | null = null;
      try {
        session = await getOrCreateChatSession(user.id, prompt || "Anexo enviado", sessionId || undefined);
        send("session", { sessionId: session.id });

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

        await assertCanGenerateWithAi(user);
        // 1 mensagem = 1 unidade do medidor CHAT, independente de quantas chamadas de LLM o
        // turno fizer (loop de tools, material, sumarização). Questões geradas neste turno
        // vão para o medidor QUESTIONS lá no funil de geração — nunca aqui.
        charge = await chargeAiAction({ user, kind: TrialUsageKind.CHAT_MESSAGE, ledgerKind: UsageKind.CHAT_MESSAGE });

        const turn = await streamChatTurn({
          user,
          sessionId: session.id,
          prompt: prompt || "Analise o anexo enviado.",
          onEvent: (event) => {
            if (event.type === "delta") send("delta", { text: event.text });
            else if (event.type === "draft_discarded") send("discard", {});
            else if (event.type === "tool_started") send("tool", { name: event.name, label: event.label });
          }
        });

        const metadata =
          turn.toolTrace.length || turn.sources?.length || turn.clarification
            ? ({
                ...(turn.toolTrace.length ? { toolCalls: turn.toolTrace } : {}),
                ...(turn.sources?.length ? { sources: turn.sources } : {}),
                ...(turn.clarification ? { clarification: turn.clarification } : {})
              } as unknown as Prisma.InputJsonValue)
            : undefined;

        const assistant = await prisma.aiChatMessage.create({
          data: {
            sessionId: session.id,
            role: AiChatRole.ASSISTANT,
            content: stripNullBytes(turn.message),
            questionSetId: turn.questionSetId,
            studyMaterialId: turn.studyMaterialId,
            metadata
          }
        });

        // Finaliza o turno para o usuário ANTES do trabalho pós-stream: a resposta
        // já foi transmitida; não faz sentido segurar o "done" por uma sumarização
        // (que é outra chamada de IA) ou pela contagem de uso.
        send("done", {
          sessionId: session.id,
          messageId: assistant.id,
          message: turn.message,
          questionSetId: turn.questionSetId ?? null,
          studyMaterialId: turn.studyMaterialId ?? null,
          sources: turn.sources ?? [],
          clarification: turn.clarification ?? null
        });

        await recordAiUsageEvent({ user, type: AiUsageEventType.CHAT_RESPONSE, model: turn.model, prompt });

        revalidatePath("/ai");
        if (turn.questionSetId) revalidatePath("/biblioteca");
        if (turn.studyMaterialId) revalidatePath("/materiais");

        // Sumarização (chamada de IA extra) roda em segundo plano — nunca atrasa o turno.
        await summarizeSessionIfNeeded(session.id).catch(() => undefined);
      } catch (error) {
        // Turno não entregou resultado: devolve a unidade cobrada na entrada.
        await refundAiAction(charge);
        await recordAiUsageEvent({
          user,
          type: AiUsageEventType.CHAT_RESPONSE,
          status: AiUsageEventStatus.ERROR,
          prompt,
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
        }).catch(() => undefined);
        send("error", { error: toFriendlyAiError(error), sessionId: session?.id ?? null });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}
