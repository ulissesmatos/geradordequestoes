import { AiChatRole, AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserStudySnapshot } from "@/lib/ai/study-tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { completeChat, type AiSettings, type NeutralMessage } from "@/lib/ai/chat/provider";

// Orçamento de custo, não de janela: gpt-4.1-mini tem janela de 1M tokens.
const HISTORY_BUDGET_TOKENS = 6000;
const MAX_CONTEXT_MESSAGES = 30;
// Mensagens recentes mantidas fora do resumo.
const KEEP_RECENT_MESSAGES = 12;
// Só sumariza quando o histórico não resumido passa deste tamanho.
const SUMMARIZE_THRESHOLD = 24;
// Limite de imagens reenviadas ao modelo por turno (controle de custo).
const MAX_IMAGES_IN_CONTEXT = 4;

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5);
}

async function blobToDataUrl(url: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime = res.headers.get("Content-Type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildTurnMessages(input: { sessionId: string; userId: string }): Promise<NeutralMessage[]> {
  const [session, subjects, snapshot] = await Promise.all([
    prisma.aiChatSession.findUnique({
      where: { id: input.sessionId },
      select: { summary: true, summarizedCount: true }
    }),
    prisma.subject.findMany({
      include: { topics: { orderBy: { name: "asc" }, select: { name: true } } },
      orderBy: { name: "asc" }
    }),
    getUserStudySnapshot(input.userId)
  ]);

  const subjectCatalog = subjects
    .map((subject) => `- ${subject.name}${subject.topics.length ? `: ${subject.topics.map((topic) => topic.name).join(", ")}` : ""}`)
    .join("\n");

  const system = buildSystemPrompt({
    subjectCatalog,
    studySnapshot: snapshot,
    conversationSummary: session?.summary
  });

  const stored = await prisma.aiChatMessage.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { createdAt: "asc" },
    skip: session?.summarizedCount ?? 0,
    select: {
      role: true,
      content: true,
      attachments: { select: { kind: true, url: true, name: true, extractedText: true } }
    }
  });

  let remainingBudget = HISTORY_BUDGET_TOKENS;
  let imagesUsed = 0;
  const history: NeutralMessage[] = [];
  for (let index = stored.length - 1; index >= 0; index -= 1) {
    const message = stored[index];
    if (message.role === AiChatRole.SYSTEM) continue;

    const pdfTexts = message.attachments
      .filter((attachment) => attachment.kind === AttachmentKind.PDF && attachment.extractedText)
      .map((attachment) => `[Conteúdo do PDF "${attachment.name}"]\n${attachment.extractedText}`);
    const augmentedContent = [message.content, ...pdfTexts].filter(Boolean).join("\n\n");

    const cost = estimateTokens(augmentedContent);
    // A mensagem mais recente (o pedido atual) entra sempre, mesmo que estoure o orçamento.
    if (history.length > 0 && (cost > remainingBudget || history.length >= MAX_CONTEXT_MESSAGES)) break;
    remainingBudget -= cost;

    if (message.role === AiChatRole.USER) {
      const images: string[] = [];
      for (const attachment of message.attachments) {
        if (attachment.kind !== AttachmentKind.IMAGE || imagesUsed >= MAX_IMAGES_IN_CONTEXT) continue;
        const dataUrl = await blobToDataUrl(attachment.url);
        if (dataUrl) {
          images.push(dataUrl);
          imagesUsed += 1;
        }
      }
      history.unshift(images.length ? { role: "user", content: augmentedContent, images } : { role: "user", content: augmentedContent });
    } else {
      history.unshift({ role: "assistant", content: augmentedContent });
    }
  }

  return [{ role: "system", content: system }, ...history];
}

/** Texto extraído de PDFs recentes da sessão, para ancorar a geração de questões no conteúdo enviado. */
export async function getRecentAttachmentText(sessionId: string, maxChars = 6000) {
  const attachments = await prisma.aiChatMessageAttachment.findMany({
    where: { message: { sessionId }, kind: AttachmentKind.PDF, NOT: { extractedText: null } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { name: true, extractedText: true }
  });
  if (attachments.length === 0) return "";
  return attachments
    .map((attachment) => `Conteúdo do arquivo "${attachment.name}":\n${attachment.extractedText}`)
    .join("\n\n")
    .slice(0, maxChars);
}

export async function maybeSummarizeSession(input: { sessionId: string; settings: AiSettings }) {
  const session = await prisma.aiChatSession.findUnique({
    where: { id: input.sessionId },
    select: { summary: true, summarizedCount: true }
  });
  if (!session) return;

  const total = await prisma.aiChatMessage.count({ where: { sessionId: input.sessionId } });
  if (total - session.summarizedCount <= SUMMARIZE_THRESHOLD) return;

  const summarizeUpTo = total - KEEP_RECENT_MESSAGES;
  if (summarizeUpTo <= session.summarizedCount) return;

  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { createdAt: "asc" },
    skip: session.summarizedCount,
    take: summarizeUpTo - session.summarizedCount,
    select: { role: true, content: true }
  });
  if (messages.length === 0) return;

  const transcript = messages
    .map((message) => `${message.role === AiChatRole.USER ? "Usuário" : "Assistente"}: ${message.content}`)
    .join("\n");

  const result = await completeChat({
    settings: input.settings,
    messages: [
      {
        role: "system",
        content:
          "Você resume conversas de um chat de estudos para concursos. Produza um resumo curto e denso, em português, preservando: matérias e assuntos discutidos, preferências do usuário (formato, dificuldade, quantidade), blocos de questões e materiais já gerados, e pendências da conversa. Responda apenas com o resumo."
      },
      {
        role: "user",
        content: [
          session.summary ? `Resumo anterior (incorpore ao novo):\n${session.summary}` : "",
          `Trecho da conversa a resumir:\n${transcript.slice(0, 20000)}`
        ]
          .filter(Boolean)
          .join("\n\n")
      }
    ],
    maxOutputTokens: 350
  });

  if (result.kind !== "text") return;

  // Guard de concorrência: só avança se ninguém sumarizou no meio do caminho.
  await prisma.aiChatSession.updateMany({
    where: { id: input.sessionId, summarizedCount: session.summarizedCount },
    data: { summary: result.text, summarizedCount: summarizeUpTo }
  });
}

export async function getRecentConversationText(sessionId: string, maxChars = 3500) {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, content: true }
  });
  return messages
    .reverse()
    .map((message) => `${message.role === AiChatRole.USER ? "Usuário" : "Assistente"}: ${message.content}`)
    .join("\n")
    .slice(0, maxChars);
}

export async function getPerformanceContext(userId: string) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: {
      question: {
        include: {
          subject: true,
          topic: true
        }
      }
    }
  });

  if (attempts.length === 0) return "";

  const errors = attempts
    .filter((attempt) => !attempt.isCorrect)
    .slice(0, 6)
    .map((attempt) => `${attempt.question.subject.name} / ${attempt.question.topic.name}: ${attempt.question.statement.slice(0, 180)}`);
  const hits = attempts
    .filter((attempt) => attempt.isCorrect)
    .slice(0, 4)
    .map((attempt) => `${attempt.question.subject.name} / ${attempt.question.topic.name}: ${attempt.question.statement.slice(0, 140)}`);

  return [
    "Use o histórico abaixo apenas como referência pedagógica para criar questões novas e originais; não copie enunciados.",
    errors.length ? `Erros recentes do aluno:\n- ${errors.join("\n- ")}` : "",
    hits.length ? `Acertos recentes do aluno:\n- ${hits.join("\n- ")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1700);
}
