import { AiUsageEventStatus, AiUsageEventType, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recordAiUsageEvent(input: {
  user: { id: string; role?: Role };
  type: AiUsageEventType;
  status?: AiUsageEventStatus;
  model?: string;
  prompt?: string;
  errorMessage?: string;
}) {
  await prisma.aiUsageEvent.create({
    data: {
      userId: input.user.id,
      type: input.type,
      status: input.status ?? AiUsageEventStatus.SUCCESS,
      model: input.model,
      prompt: input.prompt?.slice(0, 5000),
      errorMessage: input.errorMessage?.slice(0, 2000)
    }
  });
}
