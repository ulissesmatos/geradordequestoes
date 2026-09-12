import { QuestionStatus, SourceType, UsageKind, UsageMeter, type User } from "@prisma/client";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { deepStripNullBytes, stripNullBytes } from "@/lib/sanitize";
import { reserveUsage, resolveGenerationAllowance, settleUsage, type QuantityCapReason } from "@/lib/usage/ledger";

export function chatShareUrl(shareId: string): string {
  return `${appUrl()}/c/${shareId}`;
}

export type ShareActionResult = { ok: true; url: string } | { ok: false; error: string };
export type RevokeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Cria (ou reativa) o link público de uma conversa.
 *
 * `sharedUpTo` é sempre atualizado para AGORA — inclusive ao reativar um link revogado, que
 * passa a incluir as mensagens trocadas desde a revogação. Comportamento deliberado: é mais
 * simples que rotação de link, e quem já tinha o link só ganha mais conteúdo visível, nunca
 * menos (o dono é quem decidiu compartilhar de novo).
 */
export async function createOrReactivateChatShare(userId: string, sessionId: string): Promise<ShareActionResult> {
  const session = await prisma.aiChatSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return { ok: false, error: "Conversa não encontrada." };

  const now = new Date();
  const share = await prisma.chatShare.upsert({
    where: { sessionId },
    update: { revokedAt: null, sharedUpTo: now },
    create: { sessionId, userId, sharedUpTo: now },
    select: { id: true }
  });
  return { ok: true, url: chatShareUrl(share.id) };
}

export async function revokeChatShare(userId: string, sessionId: string): Promise<RevokeActionResult> {
  const result = await prisma.chatShare.updateMany({
    where: { sessionId, userId },
    data: { revokedAt: new Date() }
  });
  if (result.count === 0) return { ok: false, error: "Link não encontrado." };
  return { ok: true };
}

type TargetUser = Pick<User, "id" | "role">;
type QuantityCap = { requested: number; applied: number; reason: QuantityCapReason | null };

type ClonedQuestionSetOutcome =
  | { status: "cloned"; questionSetId: string; quantityCap: QuantityCap | null }
  | { status: "skipped"; requested: number };

/**
 * Duplica um bloco de questões para `targetUser`, cobrando da cota MENSAL dele (medidor
 * QUESTIONS) — a mesma que uma geração normal usaria. Decisão deliberada: sem isso, compartilhar-
 * e-clonar em cadeia acumularia questões de graça, contornando o teto que o plano vende.
 *
 * Corta a quantidade do mesmo jeito que `generateAndSaveQuestionSet` corta um pedido de
 * geração (mesmo `resolveGenerationAllowance`, mesmo `reason` no resultado) — reaproveita a
 * lógica em vez de inventar uma regra de corte paralela.
 *
 * NÃO grava em `AiGenerationLog`: nenhuma chamada ao provedor de IA acontece aqui, só uma
 * cópia de linhas já existentes. Grava apenas no `UsageLedger`, que
 * é o mecanismo que controla quanto o usuário ACUMULA — os logs de "Uso de IA" do admin ficam
 * fiéis a chamadas reais.
 */
async function cloneQuestionSetForUser(
  sourceSetId: string,
  targetUser: TargetUser,
  newChatSessionId: string
): Promise<ClonedQuestionSetOutcome> {
  const source = await prisma.questionSet.findUnique({
    where: { id: sourceSetId },
    include: {
      questions: {
        orderBy: { orderInSet: "asc" },
        include: { options: { orderBy: { order: "asc" } } }
      }
    }
  });
  if (!source || source.questions.length === 0) return { status: "skipped", requested: 0 };

  const requested = source.questions.length;
  const allowance = await resolveGenerationAllowance(targetUser);
  if (allowance.exhausted) return { status: "skipped", requested };

  const quantity = allowance.maxPerBlock !== null ? Math.min(requested, allowance.maxPerBlock) : requested;

  let ledgerId: string | null;
  try {
    ledgerId = await reserveUsage({
      user: targetUser,
      meter: UsageMeter.QUESTIONS,
      kind: UsageKind.QUESTION_GENERATION,
      units: quantity,
      limits: allowance.limits
    });
  } catch {
    // Corrida rara: o allowance calculado ainda estourou no insert-then-check. Mais simples e
    // seguro tratar como esgotado do que tentar de novo com um número menor.
    return { status: "skipped", requested };
  }

  const picked = source.questions.slice(0, quantity);

  const cloned = await prisma.questionSet.create({
    data: deepStripNullBytes({
      userId: targetUser.id,
      subjectId: source.subjectId,
      topicId: source.topicId,
      chatSessionId: newChatSessionId,
      title: source.title,
      prompt: source.prompt,
      mode: source.mode,
      format: source.format,
      alternativesCount: source.alternativesCount,
      difficulty: source.difficulty,
      quantity: picked.length,
      aiModel: source.aiModel,
      questions: {
        create: picked.map((question, index) => ({
          subject: { connect: { id: question.subjectId } },
          topic: { connect: { id: question.topicId } },
          orderInSet: index + 1,
          format: question.format,
          statement: question.statement,
          supportText: question.supportText,
          answer: question.answer,
          explanation: question.explanation,
          difficulty: question.difficulty,
          status: QuestionStatus.DRAFT,
          sourceType: SourceType.AI,
          aiModel: question.aiModel,
          createdBy: { connect: { id: targetUser.id } },
          options: {
            create: question.options.map((option) => ({
              label: option.label,
              text: option.text,
              isCorrect: option.isCorrect,
              order: option.order
            }))
          }
        }))
      }
    }),
    select: { id: true }
  });

  await settleUsage(ledgerId, picked.length);

  return {
    status: "cloned",
    questionSetId: cloned.id,
    quantityCap: quantity < requested ? { requested, applied: quantity, reason: allowance.reason } : null
  };
}

type ClonedMaterialOutcome = { status: "cloned"; studyMaterialId: string } | { status: "skipped" };

/** Mesmo espírito da função acima, mas para material de estudo — 1 unidade do medidor CHAT. */
async function cloneStudyMaterialForUser(sourceMaterialId: string, targetUser: TargetUser): Promise<ClonedMaterialOutcome> {
  const source = await prisma.studyMaterial.findUnique({ where: { id: sourceMaterialId } });
  if (!source) return { status: "skipped" };

  let ledgerId: string | null;
  try {
    ledgerId = await reserveUsage({ user: targetUser, meter: UsageMeter.CHAT, kind: UsageKind.MATERIAL_GENERATION, units: 1 });
  } catch {
    return { status: "skipped" };
  }

  const cloned = await prisma.studyMaterial.create({
    data: {
      userId: targetUser.id,
      subjectId: source.subjectId,
      topicId: source.topicId,
      title: source.title,
      prompt: source.prompt,
      content: source.content,
      aiModel: source.aiModel
    },
    select: { id: true }
  });

  await settleUsage(ledgerId, 1);
  return { status: "cloned", studyMaterialId: cloned.id };
}

export type CloneChatResult = { ok: true; sessionId: string } | { ok: false; error: string };

/**
 * "Continuar esta conversa": clona as mensagens do link (até `sharedUpTo`) para uma sessão
 * NOVA e independente de `targetUser` — nunca escreve na sessão do dono original, mesmo
 * espírito do "share" do ChatGPT.
 *
 * Cada mensagem é best-effort e independente: um bloco cortado por cota não derruba as outras
 * mensagens nem o resto do clone (sucesso parcial é o comportamento desejado, mesmo espírito
 * do corte "aplica e avisa" já usado na geração). Só um erro inesperado (não relacionado a
 * cota) aborta tudo — nesse caso a sessão parcial é removida antes de devolver o erro.
 */
export async function cloneSharedChatSession(targetUser: TargetUser, shareId: string): Promise<CloneChatResult> {
  const share = await prisma.chatShare.findUnique({
    where: { id: shareId, revokedAt: null },
    select: { sessionId: true, sharedUpTo: true, session: { select: { title: true } } }
  });
  if (!share) return { ok: false, error: "Link inválido ou revogado." };

  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId: share.sessionId, createdAt: { lte: share.sharedUpTo } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, questionSetId: true, studyMaterialId: true }
  });

  const newSession = await prisma.aiChatSession.create({
    data: { userId: targetUser.id, title: share.session.title },
    select: { id: true }
  });

  try {
    for (const message of messages) {
      let content = message.content;
      let clonedQuestionSetId: string | undefined;
      let clonedStudyMaterialId: string | undefined;

      if (message.questionSetId) {
        const outcome = await cloneQuestionSetForUser(message.questionSetId, targetUser, newSession.id);
        if (outcome.status === "cloned") {
          clonedQuestionSetId = outcome.questionSetId;
          if (outcome.quantityCap) {
            content += `\n\n_Importado com ${outcome.quantityCap.applied} de ${outcome.quantityCap.requested} questões — sua cota atual não permitia o bloco inteiro._`;
          }
        } else {
          content += `\n\n_[Bloco original com ${outcome.requested} questões não importado: sua cota está esgotada. Assine um plano para gerar mais.]_`;
        }
      }

      if (message.studyMaterialId) {
        const outcome = await cloneStudyMaterialForUser(message.studyMaterialId, targetUser);
        if (outcome.status === "cloned") clonedStudyMaterialId = outcome.studyMaterialId;
        else content += `\n\n_[Material original não importado: sua cota está esgotada.]_`;
      }

      await prisma.aiChatMessage.create({
        data: {
          sessionId: newSession.id,
          role: message.role,
          content: stripNullBytes(content),
          questionSetId: clonedQuestionSetId,
          studyMaterialId: clonedStudyMaterialId
        }
      });
    }
  } catch (error) {
    // Erro genuíno (não relacionado a cota, já tratada acima) — limpa a sessão parcial em vez
    // de deixar uma conversa pela metade no histórico do usuário.
    await prisma.aiChatSession.delete({ where: { id: newSession.id } }).catch(() => undefined);
    throw error;
  }

  return { ok: true, sessionId: newSession.id };
}
