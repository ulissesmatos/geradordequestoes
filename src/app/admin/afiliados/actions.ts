"use server";

import { AffiliateWithdrawalStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { generateAffiliateCode } from "@/lib/affiliates";
import { logAdminAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export type AffiliateAdminState = { ok?: boolean; error?: string } | null;

/** Cria o perfil de afiliado para uma conta escolhida a dedo (por e-mail). */
export async function createAffiliateAction(
  _: AffiliateAdminState,
  formData: FormData
): Promise<AffiliateAdminState> {
  const admin = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Informe o e-mail da conta." };
  const percent = Math.round(Number(formData.get("commissionPercent") ?? 20));
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) {
    return { error: "Comissão inválida — use um percentual entre 1 e 90." };
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return { error: "Nenhuma conta encontrada com este e-mail." };

  const existing = await prisma.affiliateProfile.findUnique({ where: { userId: user.id } });
  if (existing) return { error: "Esta conta já tem perfil de afiliado." };

  // Colisão de código é improvável (sufixo aleatório); tenta 3x por segurança.
  let profile = null;
  for (let attempt = 0; attempt < 3 && !profile; attempt++) {
    try {
      profile = await prisma.affiliateProfile.create({
        data: { userId: user.id, code: generateAffiliateCode(user.name), commissionPercent: percent }
      });
    } catch {
      // código repetido — gera outro
    }
  }
  if (!profile) return { error: "Não foi possível gerar o código. Tente novamente." };

  await logAdminAction(admin, {
    action: "create",
    entity: "AffiliateProfile",
    entityId: profile.id,
    summary: `Afiliado ${user.name} (${email}) — ${percent}%, código ${profile.code}`
  });
  revalidatePath("/admin/afiliados");
  return { ok: true };
}

/** Atualiza % de comissão e ativação de um afiliado. */
export async function updateAffiliateAction(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = String(formData.get("profileId") ?? "");
  const percent = Math.round(Number(formData.get("commissionPercent") ?? 20));
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) {
    throw new Error("Comissão inválida — use um percentual entre 1 e 90.");
  }
  const isActive = formData.get("isActive") === "on";

  const profile = await prisma.affiliateProfile.update({
    where: { id: profileId },
    data: { commissionPercent: percent, isActive },
    include: { user: { select: { name: true } } }
  });

  await logAdminAction(admin, {
    action: "update",
    entity: "AffiliateProfile",
    entityId: profile.id,
    summary: `Afiliado ${profile.user.name}: ${percent}%, ${isActive ? "ativo" : "inativo"}`
  });
  revalidatePath("/admin/afiliados");
}

/** Marca um saque como pago ou recusado (recusado devolve o valor ao saldo). */
export async function processWithdrawalAction(formData: FormData) {
  const admin = await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "PAID" && decision !== "REJECTED") throw new Error("Decisão inválida.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  const updated = await prisma.affiliateWithdrawal.updateMany({
    where: { id: withdrawalId, status: AffiliateWithdrawalStatus.REQUESTED },
    data: {
      status: decision as AffiliateWithdrawalStatus,
      note,
      processedAt: new Date()
    }
  });
  if (updated.count === 0) throw new Error("Saque não encontrado ou já processado.");

  await logAdminAction(admin, {
    action: decision === "PAID" ? "approve" : "reject",
    entity: "AffiliateWithdrawal",
    entityId: withdrawalId,
    summary: `Saque ${decision === "PAID" ? "pago" : "recusado"}${note ? ` — ${note}` : ""}`
  });
  revalidatePath("/admin/afiliados");
}
