import { AiUsageEventStatus, Role, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";

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

/** Início do mês corrente no fuso do servidor — janela de reset do trial. */
function startOfCurrentMonth() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  return start;
}

/** Início do próximo mês — usado para informar quando o trial reseta. */
function nextMonthlyReset() {
  const start = startOfCurrentMonth();
  start.setMonth(start.getMonth() + 1);
  return start.toISOString();
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
    where: { userId, createdAt: { gte: startOfCurrentMonth() } }
  });
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    enabled: limit > 0,
    exhausted: used >= limit
  };
}

export type QuestionQuantityCap = {
  /** true = conta sem assinatura (e não-admin): o teto por bloco se aplica. */
  isTrial: boolean;
  /** Máximo de questões por bloco gerado; null = sem teto (assinante, admin ou teto desligado). */
  max: number | null;
};

/**
 * Teto de questões POR bloco gerado. Complementa a cota mensal do trial: `getTrialStatus`
 * limita QUANTAS vezes o visitante gera, este teto limita o TAMANHO de cada geração.
 *
 * Sem ele, uma única mensagem grátis pedindo "20 questões" custava mais caro que um dia
 * inteiro de assinante — o pedido é atendido, mas cortado no teto, e quem chamou avisa o
 * usuário (nunca falhamos a geração por causa disso).
 */
export async function getQuestionQuantityCap(user: { id: string; role?: Role }): Promise<QuestionQuantityCap> {
  if (user.role === Role.ADMIN) return { isTrial: false, max: null };
  if (await getActiveSubscription(user.id)) return { isTrial: false, max: null };

  const settings = await getAppSettings();
  const max = settings.trialMaxQuestionsPerGeneration;
  return { isTrial: true, max: max > 0 ? max : null };
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

export async function assertCanGenerateWithAi(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return;
  const subscription = await getActiveSubscription(user.id);

  if (subscription) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usage = await prisma.aiUsageEvent.count({
      where: { userId: user.id, status: AiUsageEventStatus.SUCCESS, createdAt: { gte: today } }
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

/** Próxima meia-noite no fuso do servidor — mesmo corte usado na contagem diária. */
function nextUsageReset() {
  const reset = new Date();
  reset.setHours(0, 0, 0, 0);
  reset.setDate(reset.getDate() + 1);
  return reset.toISOString();
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const used = await prisma.aiUsageEvent.count({
      where: { userId: user.id, status: AiUsageEventStatus.SUCCESS, createdAt: { gte: today } }
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
