import { cookies } from "next/headers";
import { AiChatDashboard } from "@/components/ai-chat-dashboard";
import { Paywall } from "@/components/paywall";
import { ProfileCompletionPrompt } from "@/components/profile-completion-prompt";
import { StudyStatesPrompt } from "@/components/study-states-prompt";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getEntitlements } from "@/lib/entitlements";
import { getAiUsageStatus, getTrialStatus, hasActiveSubscription } from "@/lib/subscriptions";

export default async function AiChatPage({
  searchParams
}: {
  searchParams: Promise<{ sessionId?: string; new?: string; prompt?: string }>;
}) {
  const user = await requireUser();
  // Trial é o estado padrão: assinantes, admins e usuários com trial habilitado
  // entram no chat; o limite de gerações é aplicado na hora de gerar.
  const allowed = (await hasActiveSubscription(user)) || (await getTrialStatus(user.id)).enabled;
  if (!allowed) return <Paywall />;

  const params = await searchParams;
  const cookieStore = await cookies();
  const initialSidebarOpen = cookieStore.get("ai-sidebar")?.value !== "0";
  const [sessions, usage, subjects, entitlements] = await Promise.all([
    prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    getAiUsageStatus(user),
    prisma.subject.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 40 }),
    getEntitlements(user)
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

  // Banners entram como prop: o chat usa layout full-bleed (margens negativas)
  // e qualquer elemento renderizado antes dele quebraria a altura da tela.
  const banner = showProfilePrompt ? (
    <ProfileCompletionPrompt />
  ) : user.preferredStates.length === 0 ? (
    <StudyStatesPrompt />
  ) : undefined;

  return (
    <div>
      <AiChatDashboard
        banner={banner}
        key={params.new ? "new-chat" : session?.id ?? "empty-chat"}
        userName={user.name}
        currentSessionId={session?.id ?? null}
        usage={usage}
        isAdmin={user.role === "ADMIN"}
        canAttach={entitlements.can("chatAttachments")}
        initialSidebarOpen={initialSidebarOpen}
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
          sources: extractSources(message.metadata),
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

/** Extrai as fontes (busca web) do metadata da mensagem, com validação leve. */
function extractSources(metadata: unknown): { title: string; url: string }[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { sources?: unknown }).sources;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { title?: string; url: string } => !!s && typeof (s as { url?: unknown }).url === "string")
    .map((s) => ({ title: String(s.title || s.url), url: s.url }));
}
