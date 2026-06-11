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

/** Estado do trial (N gerações grátis no total) de quem não tem assinatura. */
export async function getTrialStatus(userId: string): Promise<TrialStatus> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { trialGenerationsUsed: true } }),
    getAppSettings()
  ]);
  const used = user?.trialGenerationsUsed ?? 0;
  const limit = settings.trialGenerationsLimit ?? 0;
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
        ? `Suas ${trial.limit} gerações gratuitas acabaram. Assine um plano para continuar gerando com IA.`
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

  // Trial: contador total (sem reset diário).
  const trial = await getTrialStatus(user.id);
  return {
    used: trial.used,
    limit: trial.limit,
    percent: trial.limit ? Math.round((trial.used / trial.limit) * 100) : 100,
    resetsAt: null,
    isTrial: true
  };
}
