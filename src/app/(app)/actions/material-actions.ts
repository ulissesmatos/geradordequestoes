"use server";

import { AiUsageEventStatus, AiUsageEventType, TrialUsageKind, UsageKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { expandStudyMaterialSection } from "@/lib/ai/generateStudyMaterial";
import { toFriendlyAiError } from "@/lib/ai/chat/errors";
import { chargeAiAction, recordAiUsageEvent, refundAiAction, type AiActionCharge } from "@/lib/ai/usage";
import type { CapabilityKey } from "@/lib/capabilities";
import { getEntitlements, upgradeRequired } from "@/lib/entitlements";
import { requireUser } from "@/lib/guards";
import { findSection, insertIntoSection, type SectionRef } from "@/lib/markdown-sections";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertCanGenerateWithAi } from "@/lib/subscriptions";

export async function updateStudyMaterialAction(id: string, content: string) {
  const user = await requireUser();
  await prisma.studyMaterial.updateMany({
    where: { id, userId: user.id },
    data: { content }
  });
  revalidatePath(`/materiais/${id}`);
}

export async function deleteStudyMaterialAction(id: string) {
  const user = await requireUser();
  await prisma.studyMaterial.deleteMany({
    where: { id, userId: user.id }
  });
  revalidatePath("/materiais");
}

export type ExpandSectionResult =
  | { ok: true; content: string }
  | { ok: false; error: string; upgrade?: boolean; capability?: CapabilityKey };

/**
 * "Aprofundar": gera conteúdo extra para UMA seção do material e insere no fim
 * dela. Recurso habilitado por plano (capability `materialExpand`) — o gate é
 * re-checado aqui no servidor, não só na UI.
 */
export async function expandMaterialSectionAction(input: {
  materialId: string;
  heading: SectionRef;
}): Promise<ExpandSectionResult> {
  const user = await requireUser();

  const { level, text, occurrence } = input.heading ?? ({} as SectionRef);
  if (
    (level !== 2 && level !== 3) ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 300 ||
    !Number.isInteger(occurrence) ||
    occurrence < 0
  ) {
    return { ok: false, error: "Requisição inválida." };
  }

  // Bypass de admin e leitura do plano ficam concentrados em getEntitlements — nenhum gate
  // reimplementa a regra de quem passa por cima do plano.
  const entitlements = await getEntitlements(user);
  if (!entitlements.can("materialExpand")) {
    return upgradeRequired(
      "materialExpand",
      "O aprofundamento de materiais com IA está disponível nos planos superiores."
    );
  }

  const rate = checkRateLimit(`material-expand:${user.id}`, RATE_LIMITS.materialExpand);
  if (!rate.ok) {
    return { ok: false, error: `Muitas solicitações. Tente novamente em ${rate.retryAfterSeconds}s.` };
  }

  const material = await prisma.studyMaterial.findFirst({
    where: { id: input.materialId, userId: user.id },
    include: { subject: { select: { name: true } }, topic: { select: { name: true } } }
  });
  if (!material) return { ok: false, error: "Material não encontrado." };

  // Confere a seção no conteúdo fresco ANTES de gastar IA (material pode ter sido editado noutra aba).
  const match = findSection(material.content, input.heading);
  if (!match) {
    return { ok: false, error: "Seção não encontrada. Recarregue a página e tente novamente." };
  }

  // Cobrado na entrada e estornado nos caminhos que não entregam conteúdo.
  let charge: AiActionCharge | null = null;
  try {
    await assertCanGenerateWithAi(user);
    // Vai para o medidor CHAT: aprofundar é uma ação de IA como uma mensagem, não geração
    // de questões. O `kind` preserva a distinção para auditoria.
    charge = await chargeAiAction({ user, kind: TrialUsageKind.MATERIAL_EXPAND, ledgerKind: UsageKind.MATERIAL_EXPAND });

    const generated = await expandStudyMaterialSection({
      materialTitle: material.title,
      materialContent: material.content,
      headingText: text.trim(),
      sectionContent: match.sectionBody || undefined,
      subjectName: material.subject?.name,
      topicName: material.topic?.name
    });

    // A geração leva 10-30s: insere sobre o conteúdo fresco com guarda de
    // concorrência (CAS no content) para não sobrescrever edição paralela.
    let newContent: string | null = null;
    for (let attempt = 0; attempt < 2 && newContent === null; attempt++) {
      const fresh = await prisma.studyMaterial.findFirst({
        where: { id: input.materialId, userId: user.id },
        select: { content: true }
      });
      if (!fresh) return { ok: false, error: "Material não encontrado." };

      const inserted = insertIntoSection(fresh.content, input.heading, generated.content);
      if (!inserted.ok) break;

      const saved = await prisma.studyMaterial.updateMany({
        where: { id: input.materialId, userId: user.id, content: fresh.content },
        data: { content: inserted.content }
      });
      if (saved.count > 0) newContent = inserted.content;
    }

    if (newContent === null) {
      await refundAiAction(charge);
      await recordAiUsageEvent({
        user,
        type: AiUsageEventType.CHAT_RESPONSE,
        status: AiUsageEventStatus.ERROR,
        model: generated.model,
        prompt: `material-expand: ${material.title} § ${text.trim()}`,
        errorMessage: "Conteúdo alterado durante a geração."
      }).catch(() => undefined);
      return { ok: false, error: "O material foi alterado enquanto a IA gerava. Recarregue a página e tente novamente." };
    }

    await recordAiUsageEvent({
      user,
      type: AiUsageEventType.CHAT_RESPONSE,
      model: generated.model,
      prompt: `material-expand: ${material.title} § ${text.trim()}`
    });

    revalidatePath(`/materiais/${input.materialId}`);
    return { ok: true, content: newContent };
  } catch (error) {
    await refundAiAction(charge);
    await recordAiUsageEvent({
      user,
      type: AiUsageEventType.CHAT_RESPONSE,
      status: AiUsageEventStatus.ERROR,
      prompt: `material-expand: ${material.title} § ${text.trim()}`,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido"
    }).catch(() => undefined);
    return { ok: false, error: toFriendlyAiError(error) };
  }
}
