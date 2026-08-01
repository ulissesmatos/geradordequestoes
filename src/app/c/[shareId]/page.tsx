import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ChatShareView, type SharedChatMessage } from "@/components/chat-share-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppSettings } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Página pública de uma conversa compartilhada (/c/<shareId>). Cópia estática congelada em
 * `sharedUpTo` — mensagens trocadas depois de compartilhar não aparecem aqui.
 */
export default async function SharedChatPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;

  const [share, session, appSettings] = await Promise.all([
    prisma.chatShare.findUnique({
      where: { id: shareId, revokedAt: null },
      select: {
        sessionId: true,
        sharedUpTo: true,
        session: { select: { title: true, user: { select: { name: true } } } }
      }
    }),
    auth(),
    getAppSettings()
  ]);

  if (!share) notFound();

  const rawMessages = await prisma.aiChatMessage.findMany({
    where: { sessionId: share.sessionId, createdAt: { lte: share.sharedUpTo } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      // Só a EXISTÊNCIA de anexo, nunca url/mimeType/extractedText — o link público nunca busca
      // o blob, então nunca esbarra no proxy autenticado nem expõe material do dono.
      _count: { select: { attachments: true } },
      questionSet: {
        select: { title: true, quantity: true, subject: { select: { name: true } }, topic: { select: { name: true } } }
      },
      studyMaterial: { select: { title: true } }
    }
  });

  const messages: SharedChatMessage[] = rawMessages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    hasAttachments: message._count.attachments > 0,
    questionSet: message.questionSet,
    studyMaterial: message.studyMaterial
  }));

  const authorFirstName = share.session.user.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={appSettings.logoUrl} appName={appSettings.appName} sticky={false} />

      <section className="mx-auto max-w-2xl px-4 py-10 md:py-14">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{share.session.title}</CardTitle>
            <CardDescription>Conversa compartilhada por {authorFirstName} · somente leitura</CardDescription>
          </CardHeader>
        </Card>

        <ChatShareView
          authorName={authorFirstName}
          messages={messages}
          shareId={shareId}
          canContinue={Boolean(session?.user?.id)}
        />
      </section>

      <SiteFooter />
    </main>
  );
}
