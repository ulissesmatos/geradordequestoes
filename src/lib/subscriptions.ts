import { AiUsageEventStatus, Role, SubscriptionCancelReason, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { startOfDayInBrazil, startOfMonthInBrazil, startOfNextDayInBrazil, startOfNextMonthInBrazil } from "@/lib/dates";

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

/** Início do próximo mês em Brasília — usado para informar quando o trial reseta. */
function nextMonthlyReset() {
  return startOfNextMonthInBrazil().toISOString();
}

/**
 * Estado do trial: N AÇÕES grátis por mês, resetando todo dia 1º.
 *
 * Conta TrialUsageEvent (uma linha por ação do usuário), não AiUsageEvent (uma linha por
 * chamada ao provedor). A diferença é o ponto: uma única mensagem que dispara geração de
 * questões produz 2 linhas em AiUsageEvent e consumia 2 unidades — com limite de 3, o visitante
 * gastava a cota inteira em duas mensagens sem entender por quê.
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

/**
 * Portão HERDADO de uso de IA, baseado em `AiUsageEvent` (chamadas ao provedor).
 *
 * Está errado por construção e é por isso que existe o medidor novo: uma mensagem de chat que
 * dispara geração grava DOIS eventos — um CHAT_RESPONSE no entry point e um
 * QUESTION_GENERATION dentro do funil — então "gere 15 questões" consumia 2 das 20 unidades
 * do plano Essencial. O trial nunca sofreu disso porque tem livro-caixa próprio; só quem
 * pagava era penalizado.
 *
 * Continua ligado enquanto `usageEnforcementEnabled` estiver em false (modo sombra), para não
 * existir janela sem limite nenhum enquanto as cotas novas são calibradas. Com o enforcement
 * ligado, quem bloqueia são os medidores de UsageLedger e esta função sai do caminho.
 */
export async function assertCanGenerateWithAi(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return;

  const settings = await getAppSettings();
  if (settings.usageEnforcementEnabled) return;

  const subscription = await getActiveSubscription(user.id);

  if (subscription) {
    const usage = await prisma.aiUsageEvent.count({
      where: { userId: user.id, status: AiUsageEventStatus.SUCCESS, createdAt: { gte: startOfDayInBrazil() } }
    });
    if (usage >= subscription.plan.aiGenerationsPerDay) {
      throw new Error("Seu limite diário de uso da IA foi atingido.");
    }
    return;
  }

  // Sem assinatura → trial.
  const trial = await getTrialStatus(user.id);
  if (!trial.enabled || trial.exhausted) {
    throw new Error(
      trial.limit > 0
        ? `Suas ${trial.limit} mensagens/gerações grátis deste mês acabaram. Assine um plano para continuar usando a IA, ou aguarde a virada do mês.`
        : "Assine um plano para usar a IA."
    );
  }
}

/** Próxima meia-noite em Brasília — mesmo corte usado na contagem diária. */
function nextUsageReset() {
  return startOfNextDayInBrazil().toISOString();
}

export type AiUsageStatus = {
  used: number;
  limit: number | null;
  percent: number;
  resetsAt: string | null;
  isTrial: boolean;
};

export async function getAiUsageStatus(user: { id: string; role?: Role }): Promise<AiUsageStatus> {
  if (user.role === Role.ADMIN) {
    return { used: 0, limit: null, percent: 0, resetsAt: nextUsageReset(), isTrial: false };
  }

  const subscription = await getActiveSubscription(user.id);
  if (subscription) {
    const used = await prisma.aiUsageEvent.count({
      where: { userId: user.id, status: AiUsageEventStatus.SUCCESS, createdAt: { gte: startOfDayInBrazil() } }
    });
    const limit = subscription.plan.aiGenerationsPerDay;
    return {
      used,
      limit,
      percent: limit ? Math.round((used / limit) * 100) : 100,
      resetsAt: nextUsageReset(),
      isTrial: false
    };
  }

  // Trial: reseta todo dia 1º do mês.
  const trial = await getTrialStatus(user.id);
  return {
    used: trial.used,
    limit: trial.limit,
    percent: trial.limit ? Math.round((trial.used / trial.limit) * 100) : 100,
    resetsAt: nextMonthlyReset(),
    isTrial: true
  };
}
