import Link from "next/link";
import { BookOpen, Paperclip, Sparkles, User as UserIcon } from "lucide-react";
import { AiChatRole } from "@prisma/client";
import { BotAvatar } from "@/components/bot-avatar";
import { ContinueChatButton } from "@/components/continue-chat-button";
import { MarkdownContent } from "@/components/markdown-content";
import { Card, CardContent } from "@/components/ui/card";

export type SharedChatMessage = {
  id: string;
  role: AiChatRole;
  content: string;
  hasAttachments: boolean;
  questionSet: { title: string; quantity: number; subject: { name: string }; topic: { name: string } } | null;
  studyMaterial: { title: string } | null;
};

/**
 * Renderização somente-leitura de uma conversa compartilhada.
 *
 * Deliberadamente um componente NOVO, não um modo do AiChatDashboard: o dashboard é 1200+
 * linhas presumindo capacidade de enviar mensagem, anexar arquivo e gerenciar sessão — nada
 * disso existe aqui. Anexos nunca são buscados (nem a URL chega até este componente); vira só
 * um aviso neutro, e blocos de questões/materiais viram cards estáticos, não interativos —
 * responder o bloco de verdade é o link de compartilhamento de bloco (/q/<id>), mecanismo
 * separado com sua própria checagem de acesso.
 */
export function ChatShareView({
  authorName,
  messages,
  shareId,
  canContinue
}: {
  authorName: string;
  messages: SharedChatMessage[];
  shareId: string;
  /** true = há sessão logada; false = anônimo, mostra CTA de entrar. */
  canContinue: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {messages.map((message) => (
          <SharedMessageBubble key={message.id} message={message} />
        ))}
      </div>

      <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-[var(--primary-soft-foreground)]">
            Conversa compartilhada por {authorName} — somente leitura.
          </p>
          {canContinue ? (
            <ContinueChatButton shareId={shareId} />
          ) : (
            <>
              <p className="font-semibold text-[var(--primary-soft-foreground)]">
                Entre para continuar esta conversa na sua própria conta
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
                >
                  <Sparkles className="h-4 w-4" />
                  Criar conta grátis
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-subtle)]"
                >
                  Entrar
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SharedMessageBubble({ message }: { message: SharedChatMessage }) {
  const isUser = message.role === AiChatRole.USER;

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <BotAvatar />}
      <div
        className={`max-w-[88%] rounded-lg p-4 text-sm leading-6 shadow-[var(--shadow-sm)] ${
          isUser
            ? "bg-[var(--primary)] text-white"
            : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownContent content={message.content} compact />
        )}

        {message.hasAttachments && (
          <p className="mt-2 flex items-center gap-1.5 text-xs italic opacity-80">
            <Paperclip className="h-3 w-3" />
            Anexo enviado pelo autor (não incluído no link compartilhado)
          </p>
        )}

        {message.questionSet && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            <span>
              <strong>{message.questionSet.title}</strong>
              <br />
              {message.questionSet.subject.name} · {message.questionSet.topic.name} · {message.questionSet.quantity}{" "}
              {message.questionSet.quantity === 1 ? "questão" : "questões"}
            </span>
          </div>
        )}

        {message.studyMaterial && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs">
            <BookOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            <strong>{message.studyMaterial.title}</strong>
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]">
          <UserIcon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        </div>
      )}
    </div>
  );
}
