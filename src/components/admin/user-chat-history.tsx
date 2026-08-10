import { AiChatRole } from "@prisma/client";
import { Paperclip } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import type { UserChatOverview } from "@/lib/usage/report";

/**
 * Histórico de chat de um usuário, do painel admin.
 *
 * Duas escolhas que valem explicação:
 *
 * 1. LISTA PLANA, NÃO POR SESSÃO. A pergunta que traz o admin aqui é "o que essa pessoa andou
 *    pedindo, e quanto isso consumiu" — que é cronológica. Agrupar por conversa esconderia
 *    justamente a sequência que responde isso; o título da sessão vira só um rótulo na linha.
 *
 * 2. CONTEÚDO EM <details>. Resposta de IA facilmente passa de 4 KB; renderizar tudo aberto
 *    tornaria a página inútil para varrer. O recorte fica no cliente, sem JS, e o texto
 *    completo continua a um clique.
 */

export type AdminChatMessageRow = {
  id: string;
  role: AiChatRole;
  content: string;
  createdAt: Date;
  sessionId: string;
  sessionTitle: string;
  attachments: number;
  questionSet: { id: string; title: string; quantity: number } | null;
  studyMaterial: { id: string; title: string } | null;
};

const ROLE_LABEL: Record<AiChatRole, string> = {
  [AiChatRole.USER]: "Usuário",
  [AiChatRole.ASSISTANT]: "IA",
  [AiChatRole.SYSTEM]: "Sistema"
};

const ROLE_TONE: Record<AiChatRole, "info" | "neutral" | "success"> = {
  [AiChatRole.USER]: "info",
  [AiChatRole.ASSISTANT]: "success",
  [AiChatRole.SYSTEM]: "neutral"
};

/** Quanto do texto entra na prévia fechada. Uma tela de scroll por linha já é demais. */
const PREVIEW_CHARS = 260;

function num(value: number) {
  return value.toLocaleString("pt-BR");
}

export function UserChatOverviewCards({ overview }: { overview: UserChatOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consumo pelo chat</CardTitle>
        <CardDescription>
          Cada mensagem enviada pelo usuário debita 1 unidade do medidor de ações; as questões geradas dentro da conversa
          debitam o medidor de questões, separadamente. Respostas da IA não são cobradas.
          {overview.firstMessageAt && (
            <>
              {" "}
              Primeira mensagem em {formatDateTimeBR(overview.firstMessageAt)}, última em{" "}
              {formatDateTimeBR(overview.lastMessageAt)}.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          value={num(overview.userMessages)}
          label="Mensagens do usuário"
          hint={`${num(overview.messages)} no total, em ${num(overview.sessions)} conversas`}
        />
        <StatTile value={num(overview.assistantMessages)} label="Respostas da IA" />
        <StatTile
          value={num(overview.questionsFromChat)}
          label="Questões geradas no chat"
          hint={`${num(overview.questionSets)} blocos`}
        />
        <StatTile
          value={num(overview.materials)}
          label="Materiais de estudo"
          hint={`${num(overview.attachments)} anexos enviados`}
        />
      </CardContent>
    </Card>
  );
}

export function UserChatMessages({
  messages,
  total,
  page,
  totalPages
}: {
  messages: AdminChatMessageRow[];
  total: number;
  page: number;
  totalPages: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensagens</CardTitle>
        <CardDescription>
          {num(total)} mensagens · página {page} de {totalPages} · da mais recente para a mais antiga
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-[var(--border)] p-0">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
        {messages.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
            Este usuário ainda não trocou nenhuma mensagem no chat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MessageRow({ message }: { message: AdminChatMessageRow }) {
  const isLong = message.content.length > PREVIEW_CHARS;
  const preview = isLong ? `${message.content.slice(0, PREVIEW_CHARS).trimEnd()}…` : message.content;

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <StatusBadge tone={ROLE_TONE[message.role]}>{ROLE_LABEL[message.role]}</StatusBadge>
        <span className="tabular-nums">{formatDateTimeBR(message.createdAt)}</span>
        <span aria-hidden>·</span>
        <span className="max-w-[18rem] truncate" title={message.sessionTitle}>
          {message.sessionTitle}
        </span>
        {message.role === AiChatRole.USER && (
          <StatusBadge tone="warning">1 ação</StatusBadge>
        )}
        {message.questionSet && (
          <StatusBadge tone="info">{message.questionSet.quantity} questões</StatusBadge>
        )}
        {message.studyMaterial && <StatusBadge tone="neutral">Material</StatusBadge>}
        {message.attachments > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {message.attachments}
          </span>
        )}
      </div>

      {isLong ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm">
            <span className="whitespace-pre-wrap break-words group-open:hidden">{preview}</span>
            <span className="mt-1 block text-xs font-semibold text-[var(--primary)]">
              <span className="group-open:hidden">Ver mensagem completa</span>
              <span className="hidden group-open:inline">Recolher</span>
            </span>
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
        </details>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{message.content || "—"}</p>
      )}

      {message.questionSet && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Bloco gerado: <span className="font-medium text-[var(--foreground)]">{message.questionSet.title}</span>
        </p>
      )}
      {message.studyMaterial && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Material: <span className="font-medium text-[var(--foreground)]">{message.studyMaterial.title}</span>
        </p>
      )}
    </div>
  );
}
