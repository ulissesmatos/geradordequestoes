"use client";

import Link from "next/link";
import { ArrowUp, Bot, Menu, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Pencil, Play, Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteChatSessionAction, generateChatQuestionSetAction, renameChatSessionAction } from "@/app/(app)/study-actions";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { MessageLoading } from "@/components/ui/message-loading";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  questionSetId?: string | null;
};

type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type QuestionSetSummary = {
  id: string;
  title: string;
  mode: "ESTUDO" | "SIMULADO" | "REVISAO";
  format: "CERTO_ERRADO" | "MULTIPLA_ESCOLHA";
  quantity: number;
};

export function AiChatDashboard({
  userName,
  currentSessionId,
  usage,
  sessions,
  messages,
  recentSets
}: {
  userName: string;
  currentSessionId: string | null;
  usage: { used: number; limit: number | null; percent: number };
  sessions: ChatSessionSummary[];
  messages: ChatMessage[];
  recentSets: QuestionSetSummary[];
}) {
  const [state, formAction] = useActionState(generateChatQuestionSetAction, null);
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [typedResponse, setTypedResponse] = useState("");
  const [typedSetId, setTypedSetId] = useState<string | null>(null);
  const [typedMessageId, setTypedMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerationPending, setIsGenerationPending] = useState(false);
  const [loadingText, setLoadingText] = useState("Pensando...");
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMessage | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 104)}px`;
  }, [message]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, optimisticMessage, typedResponse, isSubmitting, loadingText]);

  useEffect(() => {
    if (!state?.ok || !state.message) return;
    const responseMessage = state.message;
    setIsSubmitting(false);
    setIsGenerationPending(false);
    setTypedResponse("");
    setTypedSetId(state.questionSetId ?? null);
    setTypedMessageId(state.messageId ?? null);
    setMessage("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedResponse(responseMessage.slice(0, index));
      if (index >= responseMessage.length) {
        window.clearInterval(timer);
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state?.error) {
      setIsSubmitting(false);
      setIsGenerationPending(false);
    }
  }, [state]);

  useEffect(() => {
    if (!isSubmitting) {
      setLoadingText("Pensando...");
      return;
    }
    if (!isGenerationPending) {
      setLoadingText("Pensando...");
      return;
    }
    const labels = ["Pensando...", "Lendo seu contexto...", "Montando questões...", "Criando alternativas...", "Salvando o bloco..."];
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % labels.length;
      setLoadingText(labels[index]);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    setTypedResponse("");
    setTypedSetId(null);
    setTypedMessageId(null);
    setMessage("");
    setIsSubmitting(false);
    setIsGenerationPending(false);
    setOptimisticMessage(null);
  }, [currentSessionId]);

  useEffect(() => {
    if (!optimisticMessage) return;
    const alreadyArrived = messages.some(
      (chatMessage) => chatMessage.role === "USER" && chatMessage.content === optimisticMessage.content
    );
    if (alreadyArrived) setOptimisticMessage(null);
  }, [messages, optimisticMessage]);

  const activeSessionId = state?.sessionId ?? currentSessionId;
  const visibleMessages = typedMessageId
    ? messages.filter((chatMessage) => chatMessage.id !== typedMessageId)
    : messages;
  const displayMessages = useMemo(() => {
    if (!optimisticMessage) return visibleMessages;
    const alreadyVisible = visibleMessages.some(
      (chatMessage) => chatMessage.role === "USER" && chatMessage.content === optimisticMessage.content
    );
    return alreadyVisible ? visibleMessages : [...visibleMessages, optimisticMessage];
  }, [optimisticMessage, visibleMessages]);
  const hasConversation = displayMessages.length > 0 || Boolean(typedResponse) || isSubmitting;

  function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const isDesktopKeyboard = window.matchMedia("(pointer: fine)").matches;
    if (!isDesktopKeyboard) return;
    event.preventDefault();
    if (message.trim()) formRef.current?.requestSubmit();
  }

  function handleSubmit() {
    const submitted = message.trim();
    if (!submitted) return;
    setOptimisticMessage({
      id: `optimistic-${Date.now()}`,
      role: "USER",
      content: submitted
    });
    setIsGenerationPending(looksLikeQuestionGenerationClient(submitted));
    setIsSubmitting(true);
    window.setTimeout(() => {
      setMessage("");
    }, 0);
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] -my-8 flex h-[calc(100svh-61px)] w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] md:h-[calc(100vh-73px)]">
      <aside
        className={cn(
          "hidden border-r border-[var(--border)] bg-[var(--surface-subtle)] transition-all duration-200 md:flex md:flex-col",
          sidebarOpen ? "w-72" : "w-14"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
          {sidebarOpen && <span className="text-sm font-semibold">Chats</span>}
          <Button variant="ghost" size="icon" title={sidebarOpen ? "Recolher histórico" : "Abrir histórico"} onClick={() => setSidebarOpen((value) => !value)}>
            {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>
        </div>

        <div className="p-2">
          <Button asChild variant="outline" className={cn("w-full", !sidebarOpen && "px-0")}>
            <Link href="/dashboard?new=1" title="Novo chat">
              <MessageSquarePlus className="h-4 w-4" />
              {sidebarOpen && "Novo chat"}
            </Link>
          </Button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group rounded-md border border-transparent",
                activeSessionId === session.id && "border-[var(--border)] bg-[var(--muted)]"
              )}
            >
              {sidebarOpen ? (
                <div className="flex items-center gap-1">
                  <Link href={`/dashboard?sessionId=${session.id}`} className="min-w-0 flex-1 rounded-md px-2 py-2 text-sm hover:bg-[var(--muted)]">
                    <span className="block truncate">{session.title}</span>
                  </Link>
                  <details className="relative">
                    <summary className="list-none rounded-md p-2 text-[var(--muted-foreground)] hover:bg-[var(--surface)]">
                      <Pencil className="h-3.5 w-3.5" />
                    </summary>
                    <form action={renameChatSessionAction} className="absolute right-0 top-8 z-20 w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input
                        name="title"
                        defaultValue={session.title}
                        className="h-9 w-full rounded-md border border-[var(--border)] px-2 text-sm outline-none focus:border-[var(--primary)]"
                      />
                      <Button size="sm" className="mt-2 w-full">Salvar</Button>
                    </form>
                  </details>
                  <form
                    action={deleteChatSessionAction}
                    onSubmit={(event) => {
                      if (!window.confirm("Excluir este chat? Os blocos e questões gerados serão mantidos no histórico.")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="isActive" value={activeSessionId === session.id ? "true" : "false"} />
                    <Button type="submit" variant="ghost" size="icon" title="Excluir chat" className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </div>
              ) : (
                <Button asChild variant="ghost" size="icon" className="w-full">
                  <Link href={`/dashboard?sessionId=${session.id}`} title={session.title}>
                    <Menu className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/85 px-3 py-2 md:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard?new=1">
              <MessageSquarePlus className="h-4 w-4" />
              Novo chat
            </Link>
          </Button>
        </div>

        <section className={cn("min-h-0 flex-1 overflow-y-auto px-4", hasConversation ? "py-6" : "grid place-items-center py-8")}>
          {!hasConversation ? (
            <div className="w-full max-w-3xl text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
                <Bot className="h-6 w-6 text-[var(--primary)]" />
              </div>
              <h1 className="text-3xl font-light text-[var(--foreground)] md:text-4xl">O que vamos gerar hoje, {firstName(userName)}?</h1>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                Peça questões, simulados ou revisões. A IA organiza os detalhes automaticamente.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-36 md:pb-32">
              {displayMessages.map((chatMessage) => (
                <ChatBubble key={chatMessage.id} message={chatMessage} />
              ))}
              {typedResponse && (
                <div className="max-w-[88%] rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                  <ChatMessageContent content={typedResponse} />
                  {typedSetId && typedResponse === state?.message && (
                    <Button asChild size="sm" className="mt-3">
                      <Link href={`/questoes/estudar?setId=${typedSetId}`}>
                        <Play className="h-4 w-4" />
                        Responder agora
                      </Link>
                    </Button>
                  )}
                </div>
              )}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="flex max-w-[88%] items-center gap-3 rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                    <Loader variant="text-shimmer" text={loadingText} />
                    <Loader variant="typing" text={loadingText} className="text-[var(--primary)]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-20 shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {state?.suggestions && state.suggestions.length > 0 && (
            <div className="mx-auto mb-3 max-w-3xl">
              <p className="mb-2 px-1 text-xs font-medium text-[var(--muted-foreground)]">Sugestões prontas</p>
              <div className="scrollbar-ghost flex gap-2 overflow-x-auto pb-1">
              {state.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setMessage(suggestion)}
                  className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                >
                  {suggestion}
                </button>
              ))}
              </div>
            </div>
          )}

          <UsageNotice usage={usage} />

          <form ref={formRef} action={formAction} className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
            <PendingStateBridge onPendingChange={setIsSubmitting} />
            {activeSessionId && <input type="hidden" name="sessionId" value={activeSessionId} />}
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
              <textarea
                ref={textareaRef}
                name="prompt"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={submitFromKeyboard}
                required
                rows={1}
                placeholder="Ex.: gere 10 questões de crase em Português no formato Certo/Errado..."
                className="min-h-[68px] w-full resize-none border-0 bg-transparent p-4 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] md:min-h-[74px]"
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <ChatSubmitButton canSend={Boolean(message.trim())} />
              </div>
            </div>
          </form>
          <p className="mx-auto mt-3 max-w-3xl px-1 text-xs text-[var(--muted-foreground)]">
            Ex.: “simulado de geografia com 5 alternativas” ou “revisão dos meus erros de informática”.
          </p>
          {state?.error && <div className="mx-auto mt-3 max-w-3xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
        </div>
      </main>
    </div>
  );
}

function PendingStateBridge({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);
  return null;
}

function UsageNotice({ usage }: { usage: { used: number; limit: number | null; percent: number } }) {
  if (!usage.limit || usage.percent < 80) return null;
  const tone =
    usage.percent >= 100
      ? "border-red-200 bg-red-50 text-red-700"
      : usage.percent >= 90
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-yellow-200 bg-yellow-50 text-yellow-800";
  const message =
    usage.percent >= 100
      ? "Você atingiu 100% do seu limite diário de uso da IA."
      : `Você já usou ${usage.percent}% do limite diário de IA (${usage.used}/${usage.limit}).`;
  return <div className={cn("mx-auto mb-3 max-w-3xl rounded-lg border p-3 text-sm", tone)}>{message}</div>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] rounded-lg p-4 text-sm leading-6", isUser ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]")}>
        <ChatMessageContent content={message.content} />
        {message.questionSetId && (
          <Button asChild size="sm" className="mt-3">
            <Link href={`/questoes/estudar?setId=${message.questionSetId}`}>
              <Play className="h-4 w-4" />
              Responder agora
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatMessageContent({ content }: { content: string }) {
  const lines = normalizeMessageContent(content).split("\n");
  const blocks: ReactNode[] = [];
  let bulletItems: string[] = [];
  let numberedItems: Array<{ number: number; text: string }> = [];
  let nextOrderedNumber = 1;

  function flushBullets() {
    if (!bulletItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {bulletItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    bulletItems = [];
  }

  function flushNumbers() {
    if (!numberedItems.length) return;
    blocks.push(
      <div key={`ol-${blocks.length}`} className="space-y-2">
        {numberedItems.map((item, index) => (
          <div key={`${item.number}-${item.text}-${index}`} className="grid grid-cols-[1.25rem_1fr] gap-1">
            <span className="text-right tabular-nums">{item.number}.</span>
            <div>{renderInlineMarkdown(item.text)}</div>
          </div>
        ))}
      </div>
    );
    numberedItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      flushNumbers();
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      flushBullets();
      flushNumbers();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-[var(--primary)]/20" />);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushNumbers();
      bulletItems.push(bullet[1]);
      continue;
    }

    const numbered = line.match(/^(\d+)[\.)]\s+(.+)$/);
    if (numbered) {
      flushBullets();
      const sourceNumber = Number(numbered[1]);
      const displayNumber = sourceNumber === 1 && nextOrderedNumber > 1 ? nextOrderedNumber : sourceNumber;
      numberedItems.push({ number: displayNumber, text: numbered[2] });
      nextOrderedNumber = displayNumber + 1;
      continue;
    }

    flushBullets();
    flushNumbers();
    blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(line)}</p>);
  }

  flushBullets();
  flushNumbers();

  return <div className="space-y-3">{blocks.length ? blocks : <p>{content}</p>}</div>;
}

function normalizeMessageContent(content: string) {
  let text = content.trim();

  if (!text.includes("\n") && /\s-\s+/.test(text)) {
    text = text
      .replace(/:\s+-\s+/g, ":\n- ")
      .replace(/\s+-\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/g, "\n- ");
  }

  return text.replace(/\n{3,}/g, "\n\n");
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

function looksLikeQuestionGenerationClient(prompt: string) {
  const normalized = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (looksLikeMetaConversationClient(normalized)) return false;

  const hasQuestionNoun = /\b(questao|questoes|pergunta|perguntas|item|itens|exercicio|exercicios)\b/.test(normalized);
  const hasQuantity = /\d{1,2}\s*(questoes|itens|perguntas|exercicios)/.test(normalized);
  const hasGenerationCommand = /\b(gere|gerar|crie|criar|monte|elabore|faca|fazer)\b/.test(normalized);
  const hasExamMode = /\b(simulado|revisao|revisar|prova)\b/.test(normalized);
  const hasFormat = normalized.includes("alternativas") || normalized.includes("certo errado") || normalized.includes("multipla escolha");
  const hasSubject = [
    "portugues",
    "matematica",
    "informatica",
    "historia",
    "geografia",
    "direito",
    "constitucional",
    "administrativo",
    "raciocinio",
    "atualidades"
  ].some((term) => normalized.includes(term));

  if (hasGenerationCommand && (hasQuestionNoun || hasExamMode || hasFormat)) return true;
  if (hasQuantity && (hasGenerationCommand || hasFormat || hasExamMode)) return true;
  if (hasExamMode && (hasQuestionNoun || hasFormat || hasGenerationCommand || hasSubject || normalized.includes("erros"))) return true;
  if (hasFormat && (hasSubject || hasQuestionNoun || hasQuantity)) return true;
  return false;
}

function looksLikeMetaConversationClient(normalized: string) {
  return [
    "quem e voce",
    "qual a sua versao",
    "versao do chatgpt",
    "voce e daqui",
    "voce fala",
    "conversar sobre qualquer coisa",
    "qualquer assunto",
    "voce faz qualquer questao",
    "faz qualquer questao",
    "quem fala por voce",
    "quem responde por voce"
  ].some((term) => normalized.includes(term));
}

function ChatSubmitButton({ canSend }: { canSend: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="icon"
      disabled={!canSend || pending}
      className={cn(
        "rounded-md",
                canSend && !pending ? "bg-[var(--primary)] !text-white hover:bg-[var(--primary-hover)]" : "bg-[var(--muted)] !text-[var(--muted-foreground)]"
      )}
      title={pending ? "Enviando" : "Enviar"}
    >
      {pending ? <MessageLoading /> : <ArrowUp className="h-5 w-5" />}
    </Button>
  );
}
