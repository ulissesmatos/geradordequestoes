import { AiChatDashboard } from "@/components/ai-chat-dashboard";
import { Paywall } from "@/components/paywall";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getAiUsageStatus, hasActiveSubscription } from "@/lib/subscriptions";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ sessionId?: string; new?: string; prompt?: string }>;
}) {
  const user = await requireUser();
  const allowed = await hasActiveSubscription(user);
  if (!allowed) return <Paywall />;

  const params = await searchParams;
  const [sessions, usage] = await Promise.all([
    prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    getAiUsageStatus(user)
  ]);

  const selectedSessionId = params.new ? null : params.sessionId ?? sessions[0]?.id ?? null;
  const session = selectedSessionId
    ? await prisma.aiChatSession.findFirst({
      where: { id: selectedSessionId, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 80
        }
      }
    })
    : null;

  return (
    <div>
      <AiChatDashboard
        key={params.new ? "new-chat" : session?.id ?? "empty-chat"}
        userName={user.name}
        currentSessionId={session?.id ?? null}
        usage={usage}
        initialPrompt={params.prompt ? params.prompt.slice(0, 500) : undefined}
        sessions={sessions.map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt.toISOString()
        }))}
        messages={(session?.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          questionSetId: message.questionSetId,
          studyMaterialId: message.studyMaterialId
        }))}
      />
    </div>
  );
}
