import crypto from "crypto";
import { PaymentProvider, SubscriptionCancelReason, SubscriptionStatus, TeamAccountStatus, TeamSeatStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activatePaidSubscription } from "@/lib/payments";

export const TEAM_CYCLE_DAYS = 30;

/** Código de convite legível (sem caracteres ambíguos). */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_claimed" | "team_inactive" | "full" };

/**
 * Garante que o membro tenha uma assinatura ativa do plano do pacote, com o
 * vencimento do ciclo. Reaproveita o padrão de `activatePaidSubscription`:
 * se já houver uma assinatura ativa do mesmo plano, apenas estende o `endsAt`.
 */
async function applyMemberSubscription(userId: string, teamId: string, planId: string, endsAt: Date | null) {
  const active = await prisma.userSubscription.findFirst({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: "desc" }
  });
  if (active && active.planId === planId) {
    await prisma.userSubscription.update({ where: { id: active.id }, data: { endsAt } });
    return;
  }
  await activatePaidSubscription({
    userId,
    planId,
    provider: PaymentProvider.MANUAL,
    externalId: `team:${teamId}`,
    endsAt
  });
}

async function claimSeat(seatId: string, userId: string): Promise<ClaimResult> {
  const seat = await prisma.teamSeat.findUnique({ where: { id: seatId }, include: { teamAccount: true } });
  if (!seat) return { ok: false, reason: "not_found" };
  if (seat.status === TeamSeatStatus.REVOKED) return { ok: false, reason: "not_found" };

  const team = seat.teamAccount;
  if (team.status !== TeamAccountStatus.ACTIVE) return { ok: false, reason: "team_inactive" };

  // Já reivindicada por outra pessoa?
  if (seat.status === TeamSeatStatus.CLAIMED && seat.userId && seat.userId !== userId) {
    return { ok: false, reason: "already_claimed" };
  }
  // Idempotência: a própria pessoa reivindicando de novo.
  if (seat.status === TeamSeatStatus.CLAIMED && seat.userId === userId) return { ok: true };

  // Capacidade do pacote.
  const claimed = await prisma.teamSeat.count({
    where: { teamAccountId: team.id, status: TeamSeatStatus.CLAIMED }
  });
  if (claimed >= team.seats) return { ok: false, reason: "full" };

  const endsAt = team.currentPeriodEndsAt ?? addDays(new Date(), TEAM_CYCLE_DAYS);
  await prisma.teamSeat.update({
    where: { id: seat.id },
    data: { userId, claimedAt: new Date(), status: TeamSeatStatus.CLAIMED }
  });
  await applyMemberSubscription(userId, team.id, team.planId, endsAt);
  return { ok: true };
}

/** Reivindica uma vaga por código de convite. */
export async function claimTeamSeatByCode(userId: string, codeRaw: string): Promise<ClaimResult> {
  const code = (codeRaw ?? "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "not_found" };
  const seat = await prisma.teamSeat.findUnique({ where: { inviteCode: code } });
  if (!seat) return { ok: false, reason: "not_found" };
  return claimSeat(seat.id, userId);
}

/**
 * Reivindica uma vaga pela allowlist de CPF. Best-effort/idempotente: se a
 * pessoa já tem uma vaga reivindicada, não faz nada.
 */
export async function claimTeamSeatByCpf(userId: string, cpfRaw: string): Promise<ClaimResult> {
  const cpf = (cpfRaw ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, reason: "not_found" };

  const already = await prisma.teamSeat.findFirst({
    where: { userId, status: TeamSeatStatus.CLAIMED },
    select: { id: true }
  });
  if (already) return { ok: true };

  const seat = await prisma.teamSeat.findFirst({
    where: { cpf, userId: null, status: TeamSeatStatus.PENDING }
  });
  if (!seat) return { ok: false, reason: "not_found" };
  return claimSeat(seat.id, userId);
}

/**
 * Confirma pagamento / renova o pacote: estende o ciclo e propaga o novo
 * vencimento para todos os membros reivindicados (reativando os que expiraram).
 */
export async function renewTeamAccount(teamAccountId: string, days = TEAM_CYCLE_DAYS): Promise<Date | undefined> {
  const team = await prisma.teamAccount.findUnique({
    where: { id: teamAccountId },
    include: { members: { where: { status: TeamSeatStatus.CLAIMED, userId: { not: null } } } }
  });
  if (!team) return undefined;

  const now = new Date();
  const base = team.currentPeriodEndsAt && team.currentPeriodEndsAt > now ? team.currentPeriodEndsAt : now;
  const newEndsAt = addDays(base, days);

  await prisma.teamAccount.update({
    where: { id: team.id },
    data: { currentPeriodEndsAt: newEndsAt, status: TeamAccountStatus.ACTIVE }
  });

  for (const seat of team.members) {
    if (seat.userId) await applyMemberSubscription(seat.userId, team.id, team.planId, newEndsAt);
  }
  return newEndsAt;
}

/**
 * Revoga uma vaga: não será renovada nos próximos ciclos. O acesso atual
 * persiste até o fim do período já pago (conforme a regra "remove na virada").
 */
export async function revokeTeamSeat(seatId: string): Promise<void> {
  await prisma.teamSeat.update({ where: { id: seatId }, data: { status: TeamSeatStatus.REVOKED } });
}

/**
 * O usuário tem este plano cedido por um pacote de empresa?
 * Usado para negar crédito de proração em upgrades (a empresa pagou, não ele).
 */
export async function isTeamGrantedPlan(userId: string, planId: string): Promise<boolean> {
  const seat = await prisma.teamSeat.findFirst({
    where: { userId, status: TeamSeatStatus.CLAIMED },
    include: { teamAccount: { select: { planId: true } } }
  });
  return !!seat && seat.teamAccount.planId === planId;
}

/** IDs dos usuários com vaga reivindicada no pacote. */
async function claimedMemberIds(teamAccountId: string): Promise<string[]> {
  const seats = await prisma.teamSeat.findMany({
    where: { teamAccountId, status: TeamSeatStatus.CLAIMED, userId: { not: null } },
    select: { userId: true }
  });
  return seats.map((s) => s.userId!).filter(Boolean);
}

/**
 * Pausa o pacote: as assinaturas cedidas a todos os membros param de valer
 * imediatamente (status PAST_DUE), mas podem ser retomadas com `resumeTeamAccount`.
 */
export async function pauseTeamAccount(teamAccountId: string): Promise<void> {
  const team = await prisma.teamAccount.findUnique({ where: { id: teamAccountId } });
  if (!team) return;

  await prisma.teamAccount.update({ where: { id: team.id }, data: { status: TeamAccountStatus.SUSPENDED } });

  const memberIds = await claimedMemberIds(team.id);
  if (memberIds.length > 0) {
    await prisma.userSubscription.updateMany({
      where: { userId: { in: memberIds }, planId: team.planId, status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.PAST_DUE }
    });
  }
}

/** Retoma um pacote pausado: reativa as assinaturas dos membros até o fim da vigência. */
export async function resumeTeamAccount(teamAccountId: string): Promise<void> {
  const team = await prisma.teamAccount.findUnique({ where: { id: teamAccountId } });
  if (!team) return;

  await prisma.teamAccount.update({ where: { id: team.id }, data: { status: TeamAccountStatus.ACTIVE } });

  // Vigência já vencida: nada a reativar agora — o próximo "confirmar pagamento" renova todos.
  if (!team.currentPeriodEndsAt || team.currentPeriodEndsAt <= new Date()) return;

  const memberIds = await claimedMemberIds(team.id);
  if (memberIds.length > 0) {
    await prisma.userSubscription.updateMany({
      where: { userId: { in: memberIds }, planId: team.planId, status: SubscriptionStatus.PAST_DUE },
      data: { status: SubscriptionStatus.ACTIVE, endsAt: team.currentPeriodEndsAt }
    });
  }
}

/**
 * Cancela o pacote definitivamente: cancela as assinaturas cedidas de todos os
 * membros (que passam a precisar assinar por conta própria) e revoga todas as vagas.
 */
export async function cancelTeamAccount(teamAccountId: string): Promise<void> {
  const team = await prisma.teamAccount.findUnique({ where: { id: teamAccountId } });
  if (!team) return;

  await prisma.teamAccount.update({ where: { id: team.id }, data: { status: TeamAccountStatus.CANCELED } });

  const memberIds = await claimedMemberIds(team.id);
  if (memberIds.length > 0) {
    await prisma.userSubscription.updateMany({
      where: {
        userId: { in: memberIds },
        planId: team.planId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] }
      },
      data: { status: SubscriptionStatus.CANCELED, endsAt: new Date(), cancelReason: SubscriptionCancelReason.TEAM }
    });
  }

  await prisma.teamSeat.updateMany({
    where: { teamAccountId: team.id, status: { not: TeamSeatStatus.REVOKED } },
    data: { status: TeamSeatStatus.REVOKED }
  });
}
