import { AiUsageEventStatus, Role, SubscriptionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

export async function requireActiveSubscription(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return;
  const subscription = await getActiveSubscription(user.id);
  if (!subscription) redirect("/assinatura");
}

export async function assertCanGenerateWithAi(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) return;
  const subscription = await getActiveSubscription(user.id);
  if (!subscription) {
    throw new Error("Assine um plano para usar a IA.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await prisma.aiUsageEvent.count({
    where: {
      userId: user.id,
      status: AiUsageEventStatus.SUCCESS,
      createdAt: { gte: today }
    }
  });

  if (usage >= subscription.plan.aiGenerationsPerDay) {
    throw new Error("Seu limite diário de uso da IA foi atingido.");
  }
}

export async function getAiUsageStatus(user: { id: string; role?: Role }) {
  if (user.role === Role.ADMIN) {
    return { used: 0, limit: null, percent: 0 };
  }

  const subscription = await getActiveSubscription(user.id);
  if (!subscription) {
    return { used: 0, limit: 0, percent: 100 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const used = await prisma.aiUsageEvent.count({
    where: {
      userId: user.id,
      status: AiUsageEventStatus.SUCCESS,
      createdAt: { gte: today }
    }
  });

  const limit = subscription.plan.aiGenerationsPerDay;
  return {
    used,
    limit,
    percent: limit ? Math.round((used / limit) * 100) : 100
  };
}
