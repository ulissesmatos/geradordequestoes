import { AiUsageEventStatus, AiUsageEventType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/subscriptions";

export async function recordAiUsageEvent(input: {
  user: { id: string; role?: Role };
  type: AiUsageEventType;
  status?: AiUsageEventStatus;
  model?: string;
  prompt?: string;
  errorMessage?: string;
}) {
  const status = input.status ?? AiUsageEventStatus.SUCCESS;
  await prisma.aiUsageEvent.create({
    data: {
      userId: input.user.id,
      type: input.type,
      status,
      model: input.model,
      prompt: input.prompt?.slice(0, 5000),
      errorMessage: input.errorMessage?.slice(0, 2000)
    }
  });

  // Trial: consome uma geração gratuita por uso bem-sucedido de quem não é admin
  // e não tem assinatura ativa. Idempotente por evento (1 incremento por geração).
  if (status === AiUsageEventStatus.SUCCESS && input.user.role !== Role.ADMIN) {
    const subscription = await getActiveSubscription(input.user.id);
    if (!subscription) {
      await prisma.user.update({
        where: { id: input.user.id },
        data: { trialGenerationsUsed: { increment: 1 } }
      });
    }
  }
}
