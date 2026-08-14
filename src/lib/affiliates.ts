import crypto from "crypto";
import { cookies } from "next/headers";
import { AffiliateWithdrawalStatus, PaymentTransactionStatus } from "@prisma/client";
import { getAppSettings } from "@/lib/app-settings";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

/**
 * Programa de afiliados (por convite): admin cria o perfil, o afiliado divulga
 * /r/<code>, o cookie atribui o cadastro e cada pagamento aprovado do indicado
 * vira comissão. Saldo = comissões - saques (solicitados ou pagos).
 */

export const AFFILIATE_COOKIE = "aff_ref";
export const AFFILIATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

/** Valor mínimo de saque: R$ 20,00. */
export const MIN_WITHDRAWAL_CENTS = 2000;

export function affiliateLinkUrl(code: string) {
  return `${appUrl()}/r/${code}`;
}

/** Código curto e legível a partir do nome (ex.: "maria-a1b2c3"). */
export function generateAffiliateCode(name: string): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")[0]
      .slice(0, 12) || "afiliado";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Atribui o novo usuário ao afiliado do cookie, se houver. Chamado no cadastro
 * (credenciais e Google). Best-effort: nunca lança e nunca sobrescreve uma
 * atribuição existente; auto-indicação é ignorada.
 */
export async function claimAffiliateReferralFromCookie(newUserId: string): Promise<void> {
  try {
    const store = await cookies();
    const code = store.get(AFFILIATE_COOKIE)?.value?.trim();
    if (!code) return;

    const profile = await prisma.affiliateProfile.findUnique({ where: { code } });
    if (!profile || !profile.isActive || profile.userId === newUserId) return;

    await prisma.affiliateReferral.createMany({
      data: [{ affiliateId: profile.id, referredUserId: newUserId }],
      skipDuplicates: true
    });
  } catch {
    // atribuição é best-effort — nunca pode quebrar o cadastro
  }
}

/**
 * Gera a comissão de um pagamento aprovado de usuário indicado. Idempotente
 * (única por paymentTransactionId — webhooks repetidos não duplicam) e respeita o teto global
 * AppSetting.affiliateCommissionCapPayments (quantas cobranças daquele indicado pagam comissão).
 * Best-effort: nunca lança para não afetar o fluxo de pagamento.
 */
export async function recordAffiliateCommission(transaction: {
  id: string;
  userId: string;
  amountCents: number;
  status: PaymentTransactionStatus;
}): Promise<void> {
  if (transaction.status !== PaymentTransactionStatus.APPROVED) return;
  try {
    const referral = await prisma.affiliateReferral.findUnique({
      where: { referredUserId: transaction.userId },
      include: { affiliate: true }
    });
    if (!referral || !referral.affiliate.isActive) return;
    if (referral.affiliate.userId === transaction.userId) return;

    const percent = referral.affiliate.commissionPercent;
    const amount = Math.floor((transaction.amountCents * percent) / 100);
    if (amount <= 0) return;

    const { affiliateCommissionCapPayments } = await getAppSettings();

    // Transação: contar comissões já pagas para este indicado e decidir se o teto foi atingido
    // precisa ser atômico com o insert, senão duas cobranças aprovadas quase ao mesmo tempo
    // (ex.: webhook duplicado do gateway) poderiam passar do teto antes que a primeira grave.
    await prisma.$transaction(async (tx) => {
      if (affiliateCommissionCapPayments > 0) {
        const paidCount = await tx.affiliateCommission.count({
          where: { affiliateId: referral.affiliateId, referredUserId: transaction.userId }
        });
        if (paidCount >= affiliateCommissionCapPayments) return;
      }

      await tx.affiliateCommission.createMany({
        data: [
          {
            affiliateId: referral.affiliateId,
            referredUserId: transaction.userId,
            paymentTransactionId: transaction.id,
            baseAmountCents: transaction.amountCents,
            percent,
            amountCents: amount
          }
        ],
        skipDuplicates: true
      });
    });
  } catch {
    // comissão é best-effort — o pagamento do aluno nunca pode falhar por causa dela
  }
}

/** Total de comissão de afiliado gerada no período — entra no DRE como custo de aquisição. */
export async function getAffiliateCommissionTotal(range?: { from: Date; to: Date }): Promise<number> {
  const agg = await prisma.affiliateCommission.aggregate({
    where: range ? { createdAt: { gte: range.from, lte: range.to } } : {},
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

/**
 * Soma de saques de afiliado JÁ PAGOS — usada no saldo de caixa acumulado. Comissão gerada mas
 * ainda não sacada (REQUESTED) não desconta: esse dinheiro ainda está na conta da empresa, só
 * virou uma dívida (o afiliado tem direito a ele, mas ainda não retirou).
 */
export async function getPaidAffiliateWithdrawalTotal(): Promise<number> {
  const agg = await prisma.affiliateWithdrawal.aggregate({
    where: { status: AffiliateWithdrawalStatus.PAID },
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

export type AffiliateReferralDetail = {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
  hasPaid: boolean;
  totalPaidCents: number;
  commissionEarnedCents: number;
};

/** Lista dos indicados de um afiliado, com status de conversão (pagou ou não). */
export async function getAffiliateReferralDetails(affiliateId: string): Promise<AffiliateReferralDetail[]> {
  const referrals = await prisma.affiliateReferral.findMany({
    where: { affiliateId },
    include: { referredUser: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" }
  });
  if (referrals.length === 0) return [];

  const userIds = referrals.map((referral) => referral.referredUserId);
  const [payments, commissions] = await Promise.all([
    prisma.paymentTransaction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: PaymentTransactionStatus.APPROVED },
      _sum: { amountCents: true }
    }),
    prisma.affiliateCommission.groupBy({
      by: ["referredUserId"],
      where: { affiliateId, referredUserId: { in: userIds } },
      _sum: { amountCents: true }
    })
  ]);
  const paidByUser = new Map(payments.map((row) => [row.userId, row._sum.amountCents ?? 0]));
  const commissionByUser = new Map(commissions.map((row) => [row.referredUserId, row._sum.amountCents ?? 0]));

  return referrals.map((referral) => ({
    userId: referral.referredUserId,
    name: referral.referredUser.name,
    email: referral.referredUser.email,
    joinedAt: referral.createdAt,
    hasPaid: (paidByUser.get(referral.referredUserId) ?? 0) > 0,
    totalPaidCents: paidByUser.get(referral.referredUserId) ?? 0,
    commissionEarnedCents: commissionByUser.get(referral.referredUserId) ?? 0
  }));
}

export type AffiliateBalance = {
  totalEarnedCents: number;
  withdrawnCents: number; // solicitados + pagos (REJECTED volta ao saldo)
  availableCents: number;
};

export async function getAffiliateBalance(affiliateId: string): Promise<AffiliateBalance> {
  const [earned, withdrawn] = await Promise.all([
    prisma.affiliateCommission.aggregate({
      where: { affiliateId },
      _sum: { amountCents: true }
    }),
    prisma.affiliateWithdrawal.aggregate({
      where: {
        affiliateId,
        status: { in: [AffiliateWithdrawalStatus.REQUESTED, AffiliateWithdrawalStatus.PAID] }
      },
      _sum: { amountCents: true }
    })
  ]);
  const totalEarnedCents = earned._sum.amountCents ?? 0;
  const withdrawnCents = withdrawn._sum.amountCents ?? 0;
  return {
    totalEarnedCents,
    withdrawnCents,
    availableCents: Math.max(0, totalEarnedCents - withdrawnCents)
  };
}

/** Visão completa do afiliado para a página /afiliado. */
export async function getAffiliateOverview(userId: string) {
  const profile = await prisma.affiliateProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  const [balance, referralsCount, paidReferrals, commissions, withdrawals] = await Promise.all([
    getAffiliateBalance(profile.id),
    prisma.affiliateReferral.count({ where: { affiliateId: profile.id } }),
    prisma.affiliateCommission.groupBy({
      by: ["referredUserId"],
      where: { affiliateId: profile.id }
    }),
    prisma.affiliateCommission.findMany({
      where: { affiliateId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.affiliateWithdrawal.findMany({
      where: { affiliateId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  return {
    profile,
    balance,
    referralsCount,
    paidReferralsCount: paidReferrals.length,
    commissions,
    withdrawals
  };
}
