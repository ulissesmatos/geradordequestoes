import { QuestionSetShareVisibility, Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/payments";

export function questionSetShareUrl(shareId: string): string {
  return `${appUrl()}/q/${shareId}`;
}

export type ShareActionResult = { ok: true; url: string } | { ok: false; error: string };
export type RevokeActionResult = { ok: true } | { ok: false; error: string };

type Actor = Pick<User, "id" | "role">;

/**
 * Cria (ou reativa) o link público de um bloco de questões.
 *
 * `upsert` por `questionSetId` (único): a primeira vez cria a linha; reabrir o modal depois
 * só limpa `revokedAt` e devolve o MESMO link — reativar não gera token novo, é mais simples
 * que rotação de link e é o comportamento que a UI de compartilhar já assume (mesma URL volta
 * a funcionar). Reativar NUNCA mexe em `visibility`: é config sticky do link, só muda via
 * updateQuestionSetShareVisibility (ação explícita do admin).
 *
 * `visibility` de criação: admin nasce EVERYONE (opção padrão pré-selecionada, ajustável depois
 * no modal); dono comum nasce LOGGED_IN, o comportamento histórico — só admin tem a opção de
 * mudar quem vê o link.
 */
export async function createOrReactivateQuestionSetShare(actor: Actor, questionSetId: string): Promise<ShareActionResult> {
  const set = await prisma.questionSet.findFirst({ where: { id: questionSetId, userId: actor.id }, select: { id: true } });
  if (!set) return { ok: false, error: "Bloco não encontrado." };

  const share = await prisma.questionSetShare.upsert({
    where: { questionSetId },
    update: { revokedAt: null },
    create: {
      questionSetId,
      userId: actor.id,
      visibility: actor.role === Role.ADMIN ? QuestionSetShareVisibility.EVERYONE : QuestionSetShareVisibility.LOGGED_IN
    },
    select: { id: true }
  });
  return { ok: true, url: questionSetShareUrl(share.id) };
}

/** Revoga o link. Efeito imediato: toda leitura pública filtra `revokedAt: null`. */
export async function revokeQuestionSetShare(userId: string, questionSetId: string): Promise<RevokeActionResult> {
  const result = await prisma.questionSetShare.updateMany({
    where: { questionSetId, userId },
    data: { revokedAt: new Date() }
  });
  if (result.count === 0) return { ok: false, error: "Link não encontrado." };
  return { ok: true };
}

/**
 * Ajusta quem enxerga/responde um link já existente. Só o dono pode chamar (mesmo filtro de
 * `revokeQuestionSetShare`); a checagem de "só admin decide isso" é responsabilidade de quem
 * chama esta função (a server action), não dela — mantém a função reaproveitável caso um dia
 * outro caller precise de outra regra de quem pode ajustar.
 */
export async function updateQuestionSetShareVisibility(
  userId: string,
  questionSetId: string,
  visibility: QuestionSetShareVisibility
): Promise<RevokeActionResult> {
  const result = await prisma.questionSetShare.updateMany({
    where: { questionSetId, userId },
    data: { visibility }
  });
  if (result.count === 0) return { ok: false, error: "Link não encontrado." };
  return { ok: true };
}
