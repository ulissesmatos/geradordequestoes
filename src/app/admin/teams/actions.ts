"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAdminAction } from "@/lib/audit";
import { formatDateBR } from "@/lib/dates";
import { requireAdmin } from "@/lib/guards";
import { createPixPayment, TEAM_CHARGE_REF_PREFIX } from "@/lib/mercado-pago";
import { appUrl, getPaymentSettings } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import {
  cancelTeamAccount,
  generateInviteCode,
  pauseTeamAccount,
  renewTeamAccount,
  resumeTeamAccount,
  revokeTeamSeat,
  TEAM_CYCLE_DAYS
} from "@/lib/teams";
import { isValidCpf, onlyDigits } from "@/lib/validation/cpf";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function createTeamAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const planId = String(formData.get("planId") ?? "");
  const seats = Math.max(1, Number(formData.get("seats") ?? 1) || 1);
  const priceCents = Math.round(Number(formData.get("price") ?? 0) * 100);
  if (name.length < 2) throw new Error("Informe o nome do pacote/empresa.");
  if (!planId) throw new Error("Selecione o plano (tier) do pacote.");

  const team = await prisma.teamAccount.create({
    data: {
      name,
      planId,
      seats,
      priceCents,
      contactName: String(formData.get("contactName") || "") || null,
      contactEmail: String(formData.get("contactEmail") || "") || null,
      contactPhone: String(formData.get("contactPhone") || "") || null,
      cpfCnpj: String(formData.get("cpfCnpj") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      // Primeiro ciclo começa já válido; o admin confirma os pagamentos seguintes.
      currentPeriodEndsAt: addDays(new Date(), TEAM_CYCLE_DAYS)
    }
  });
  await logAdminAction(admin, { action: "create", entity: "TeamAccount", entityId: team.id, summary: name });
  revalidatePath("/admin/teams");
  redirect(`/admin/teams/${team.id}`);
}

export async function updateTeamAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const seats = Math.max(1, Number(formData.get("seats") ?? 1) || 1);
  const priceCents = Math.round(Number(formData.get("price") ?? 0) * 100);

  // Status NÃO é editado aqui: pausar/retomar/cancelar têm ações próprias que
  // propagam o efeito às assinaturas dos membros.
  await prisma.teamAccount.update({
    where: { id },
    data: {
      name,
      seats,
      priceCents,
      contactName: String(formData.get("contactName") || "") || null,
      contactEmail: String(formData.get("contactEmail") || "") || null,
      contactPhone: String(formData.get("contactPhone") || "") || null,
      cpfCnpj: String(formData.get("cpfCnpj") || "") || null,
      notes: String(formData.get("notes") || "") || null
    }
  });
  await logAdminAction(admin, { action: "update", entity: "TeamAccount", entityId: id, summary: name });
  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
}

export async function pauseTeamAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("teamAccountId") ?? "");
  await pauseTeamAccount(id);
  await logAdminAction(admin, { action: "update", entity: "TeamAccount", entityId: id, summary: "pacote pausado (assinaturas dos membros suspensas)" });
  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
}

export async function resumeTeamAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("teamAccountId") ?? "");
  await resumeTeamAccount(id);
  await logAdminAction(admin, { action: "update", entity: "TeamAccount", entityId: id, summary: "pacote retomado (assinaturas reativadas)" });
  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
}

export async function cancelTeamAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("teamAccountId") ?? "");
  await cancelTeamAccount(id);
  await logAdminAction(admin, { action: "update", entity: "TeamAccount", entityId: id, summary: "pacote CANCELADO (assinaturas canceladas, vagas revogadas)" });
  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
}

/** Emite uma cobrança Pix avulsa (vencimento 24h) com link público para a empresa pagar. */
export async function issueTeamChargeAction(formData: FormData) {
  const admin = await requireAdmin();
  const teamAccountId = String(formData.get("teamAccountId") ?? "");
  const team = await prisma.teamAccount.findUnique({ where: { id: teamAccountId } });
  if (!team) throw new Error("Pacote não encontrado.");

  const amountCents = Math.round(Number(formData.get("amount") ?? 0) * 100) || team.priceCents;
  if (amountCents < 100) throw new Error("Informe um valor de pelo menos R$ 1,00.");

  const settings = await getPaymentSettings();
  if (!settings.mercadoPagoAccessToken) {
    throw new Error("Configure o Access Token do Mercado Pago em Admin → Pagamentos para emitir cobranças Pix.");
  }

  const charge = await prisma.teamCharge.create({
    data: { teamAccountId: team.id, amountCents }
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    const payment = await createPixPayment({
      accessToken: settings.mercadoPagoAccessToken,
      amountCents,
      description: `Assinatura em grupo — ${team.name}`,
      payer: { email: team.contactEmail || admin.email },
      externalReference: `${TEAM_CHARGE_REF_PREFIX}${charge.id}`,
      notificationUrl: `${appUrl()}/api/webhooks/mercado-pago`,
      expiresAt
    });
    await prisma.teamCharge.update({
      where: { id: charge.id },
      data: {
        externalId: payment.id,
        pixQrCode: payment.qrCode,
        pixQrCodeBase64: payment.qrCodeBase64,
        expiresAt
      }
    });
  } catch (error) {
    // Falhou no MP: remove a cobrança órfã para não poluir a lista.
    await prisma.teamCharge.delete({ where: { id: charge.id } }).catch(() => {});
    throw error;
  }

  await logAdminAction(admin, {
    action: "create",
    entity: "TeamCharge",
    entityId: charge.id,
    summary: `cobrança Pix de R$ ${(amountCents / 100).toFixed(2)} para ${team.name}`
  });
  revalidatePath(`/admin/teams/${teamAccountId}`);
}

export async function generateTeamSeatsAction(formData: FormData) {
  const admin = await requireAdmin();
  const teamAccountId = String(formData.get("teamAccountId") ?? "");
  const quantity = Math.min(500, Math.max(1, Number(formData.get("quantity") ?? 1) || 1));

  await prisma.teamSeat.createMany({
    data: Array.from({ length: quantity }, () => ({ teamAccountId, inviteCode: generateInviteCode() }))
  });
  await logAdminAction(admin, { action: "create", entity: "TeamSeat", entityId: teamAccountId, summary: `${quantity} códigos gerados` });
  revalidatePath(`/admin/teams/${teamAccountId}`);
}

export async function addTeamCpfsAction(formData: FormData) {
  const admin = await requireAdmin();
  const teamAccountId = String(formData.get("teamAccountId") ?? "");
  const raw = String(formData.get("cpfs") ?? "");

  // Aceita CPFs separados por vírgula, espaço ou quebra de linha; valida dígitos.
  const cpfs = Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((c) => onlyDigits(c))
        .filter((c) => c.length === 11 && isValidCpf(c))
    )
  );
  if (cpfs.length > 0) {
    // Evita duplicar CPFs já cadastrados neste pacote.
    const existing = await prisma.teamSeat.findMany({
      where: { teamAccountId, cpf: { in: cpfs } },
      select: { cpf: true }
    });
    const existingSet = new Set(existing.map((e) => e.cpf));
    const toCreate = cpfs.filter((c) => !existingSet.has(c));
    if (toCreate.length > 0) {
      await prisma.teamSeat.createMany({
        data: toCreate.map((cpf) => ({ teamAccountId, cpf }))
      });
    }
  }
  await logAdminAction(admin, { action: "create", entity: "TeamSeat", entityId: teamAccountId, summary: `${cpfs.length} CPFs adicionados` });
  revalidatePath(`/admin/teams/${teamAccountId}`);
}

export async function revokeTeamSeatAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const teamAccountId = String(formData.get("teamAccountId") ?? "");
  await revokeTeamSeat(id);
  await logAdminAction(admin, { action: "update", entity: "TeamSeat", entityId: id, summary: "vaga revogada" });
  revalidatePath(`/admin/teams/${teamAccountId}`);
}

export async function renewTeamAction(formData: FormData) {
  const admin = await requireAdmin();
  const teamAccountId = String(formData.get("teamAccountId") ?? "");
  const newEndsAt = await renewTeamAccount(teamAccountId);
  await logAdminAction(admin, {
    action: "update",
    entity: "TeamAccount",
    entityId: teamAccountId,
    summary: newEndsAt ? `pagamento confirmado, vigência até ${formatDateBR(newEndsAt)}` : "renovação"
  });
  revalidatePath(`/admin/teams/${teamAccountId}`);
  revalidatePath("/admin/teams");
}
