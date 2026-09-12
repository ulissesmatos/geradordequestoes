import { Role, SubscriptionCancelReason, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { startOfMonthInBrazil } from "@/lib/dates";

export async function getActiveSubscription(userId: string) {
  return prisma.userSubscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
    },
    include: { plan: true, coupon: true },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * Stripe grava o MESMO SubscriptionEventType.CANCELED tanto pra cancelamento voluntário
 * (portal) quanto pra esgotamento de tentativas de cobrança (dunning) — só dá pra diferenciar
 * olhando qual evento veio por último entre PAST_DUE e PAID nesta assinatura: se foi PAST_DUE
 * sem PAID depois, o cancelamento foi por falta de pagamento.
 */
export async function inferStripeCancelReason(subscriptionId: string | null | undefined): Promise<SubscriptionCancelReason> {
  if (!subscriptionId) return SubscriptionCancelReason.VOLUNTARY;
  const lastSignal = await prisma.subscriptionEvent.findFirst({
    where: { subscriptionId, type: { in: [SubscriptionEventType.PAST_DUE, SubscriptionEventType.PAID] } },
    orderBy: { createdAt: "desc" }
  });
  return lastSignal?.type === SubscriptionEventType.PAST_DUE
    ? SubscriptionCancelReason.PAYMENT_FAILED
    : SubscriptionCancelReason.VOLUNTARY;
}

export async function hasActiveSubscription(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return true;
  return Boolean(await getActiveSubscription(user.id));
}

export type TrialStatus = {
  used: number;
  limit: number;
  remaining: number;
  enabled: boolean;
  exhausted: boolean;
};

/**
 * Estado do trial: N AÇÕES grátis por mês, resetando todo dia 1º.
 *
 * Conta TrialUsageEvent (uma linha por ação do usuário), não chamadas ao provedor — uma
 * mensagem que dispara tool de geração + várias iterações consome 1 linha aqui, não uma por
 * chamada de IA.
 */
export async function getTrialStatus(userId: string): Promise<TrialStatus> {
  const settings = await getAppSettings();
  const limit = settings.trialGenerationsLimit ?? 0;
  const used = await prisma.trialUsageEvent.count({
    where: { userId, createdAt: { gte: startOfMonthInBrazil() } }
  });
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    enabled: limit > 0,
    exhausted: used >= limit
  };
}

export async function requireActiveSubscription(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return;
  const subscription = await getActiveSubscription(user.id);
  if (subscription) return;
  // Trial é o estado padrão: enquanto habilitado (limite global > 0), o usuário
  // tem acesso ao app — o bloqueio só ocorre na geração além do limite.
  const trial = await getTrialStatus(user.id);
  if (trial.enabled) return;
  redirect("/assinatura");
}

