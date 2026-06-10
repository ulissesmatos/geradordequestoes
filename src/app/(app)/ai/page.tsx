import { AiChatDashboard } from "@/components/ai-chat-dashboard";
import { Paywall } from "@/components/paywall";
import { ProfileCompletionPrompt } from "@/components/profile-completion-prompt";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getAiUsageStatus, hasActiveSubscription } from "@/lib/subscriptions";

export default async function AiChatPage({
  searchParams
}: {
  searchParams: Promise<{ sessionId?: string; new?: string; prompt?: string }>;
}) {
  const user = await requireUser();
  const allowed = await hasActiveSubscription(user);
  if (!allowed) return <Paywall />;

  const params = await searchParams;
  const [sessions, usage, subjects] = await Promise.all([
    prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    getAiUsageStatus(user),
    prisma.subject.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 40 })
  ]);

  const selectedSessionId = params.new ? null : params.sessionId ?? sessions[0]?.id ?? null;
  const session = selectedSessionId
    ? await prisma.aiChatSession.findFirst({
      where: { id: selectedSessionId, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 80,
          include: {
            attachments: { select: { id: true, kind: true, url: true, name: true } }
          }
        }
      }
    })
    : null;

  // Prompt suave para completar cadastro fiscal — só após e-mail verificado
  // (evita empilhar com o banner de verificação) e quando falta CPF.
  const showProfilePrompt = !user.cpf && !!user.emailVerified;

  return (
    <div>
      {showProfilePrompt && <ProfileCompletionPrompt />}
      <AiChatDashboard
        key={params.new ? "new-chat" : session?.id ?? "empty-chat"}
        userName={user.name}
        currentSessionId={session?.id ?? null}
        usage={usage}
        subjectNames={subjects.map((subject) => subject.name)}
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
          studyMaterialId: message.studyMaterialId,
          attachments: message.attachments.map((attachment) => ({
            id: attachment.id,
            kind: attachment.kind,
            url: attachment.url,
            name: attachment.name
          }))
        }))}
      />
    </div>
  );
}
