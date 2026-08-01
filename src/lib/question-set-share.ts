import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/payments";

export function questionSetShareUrl(shareId: string): string {
  return `${appUrl()}/q/${shareId}`;
}

export type ShareActionResult = { ok: true; url: string } | { ok: false; error: string };
export type RevokeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Cria (ou reativa) o link público de um bloco de questões.
 *
 * `upsert` por `questionSetId` (único): a primeira vez cria a linha; reabrir o modal depois
 * só limpa `revokedAt` e devolve o MESMO link — reativar não gera token novo, é mais simples
 * que rotação de link e é o comportamento que a UI de compartilhar já assume (mesma URL volta
 * a funcionar).
 */
export async function createOrReactivateQuestionSetShare(userId: string, questionSetId: string): Promise<ShareActionResult> {
  const set = await prisma.questionSet.findFirst({ where: { id: questionSetId, userId }, select: { id: true } });
  if (!set) return { ok: false, error: "Bloco não encontrado." };

  const share = await prisma.questionSetShare.upsert({
    where: { questionSetId },
    update: { revokedAt: null },
    create: { questionSetId, userId },
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
