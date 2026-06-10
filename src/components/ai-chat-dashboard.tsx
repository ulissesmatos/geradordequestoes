"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Bot, FileText, History, Image as ImageIcon, Loader2, MessageSquarePlus, Paperclip, PanelLeftClose, PanelLeftOpen, Pencil, Play, Trash2, X } from "lucide-react";
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState, useMemo } from "react";
import { deleteChatSessionAction, renameChatSessionAction } from "@/app/(app)/actions/chat-actions";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { MessageLoading } from "@/components/ui/message-loading";
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMITS, attachmentKindFromMime, blobProxyUrl, type AttachmentKindValue } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type ChatAttachment = {
  id: string;
  kind: AttachmentKindValue;
  url: string;
  name: string;
};

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  questionSetId?: string | null;
  studyMaterialId?: string | null;
  attachments?: ChatAttachment[];
};

type FileAttachment = {
  id: string;
  kind: AttachmentKindValue;
  name: string;
  mimeType: string;
  size: number;
  status: "uploading" | "ready" | "error";
  url?: string;
  previewUrl?: string;
  extractedText?: string;
  error?: string;
};

type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

const FALLBACK_SUBJECTS = ["Português", "Informática", "Direito Constitucional", "Raciocínio Lógico", "Direito Administrativo"];
const PASTE_AS_ATTACHMENT_THRESHOLD = 1500;

function pickSubjects(subjectNames: string[] | undefined, count: number) {
  const pool = subjectNames && subjectNames.length ? subjectNames : FALLBACK_SUBJECTS;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, index) => shuffled[index % shuffled.length]);
}

function buildQuickPrompts(subjectNames: string[] | undefined) {
  const [a, b, c] = pickSubjects(subjectNames, 3);
  return [
    `Gerar 10 questões de ${a} em Certo/Errado`,
    `Simulado de ${b} nível difícil com 5 alternativas`,
    "Criar revisão dos meus erros recentes",
    `Gerar material de estudo de ${c}`
  ];
}

function buildPlaceholders(subjectNames: string[] | undefined) {
  const [a, b, c, d] = pickSubjects(subjectNames, 4);
  return [
    `Ex.: gere 10 questões de ${a} em Certo/Errado`,
    `Ex.: simulado de ${b} com 5 alternativas`,
    `Ex.: revisão dos meus erros de ${c}`,
    `Ex.: material de estudo sobre ${d}`,
    "Ex.: qual é a minha pior matéria?"
  ];
}

const loadingLabels = ["Pensando...", "Consultando...", "Preparando a resposta...", "Quase lá...", "Organizando as ideias...", "Só um momento...", "Analisando os detalhes...", "Processando a informação...", "Ajustando os parâmetros...", "Refletindo sobre a melhor resposta..."];

const TOOL_LABELS: Record<string, string> = {
  generate_questions: "Gerando suas questões…",
  generate_review_from_mistakes: "Montando sua revisão…",
  generate_study_material: "Escrevendo o material…",
  get_performance: "Consultando seu desempenho…",
  get_study_history: "Consultando seu histórico…"
};

export function AiChatDashboard({
  userName,
  currentSessionId,
  usage,
  sessions,
  messages,
  initialPrompt,
  subjectNames
}: {
  userName: string;
  currentSessionId: string | null;
  usage: { used: number; limit: number | null; percent: number };
  sessions: ChatSessionSummary[];
  messages: ChatMessage[];
  initialPrompt?: string;
  subjectNames?: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState(initialPrompt ?? "");
  const [pastedBlocks, setPastedBlocks] = useState<{ id: string; chars: number; text: string }[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [typedResponse, setTypedResponse] = useState("");
  const [typedSetId, setTypedSetId] = useState<string | null>(null);
  const [typedMaterialId, setTypedMaterialId] = useState<string | null>(null);
  const [typedMessageId, setTypedMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(loadingLabels[0]);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickPrompts = useMemo(() => buildQuickPrompts(subjectNames), [subjectNames]);
  const placeholders = useMemo(() => buildPlaceholders(subjectNames), [subjectNames]);
  const composedPrompt = useMemo(
    () => [message.trim(), ...pastedBlocks.map((block) => block.text)].filter(Boolean).join("\n\n"),
    [message, pastedBlocks]
  );
  const readyAttachments = fileAttachments.filter((attachment) => attachment.status === "ready" && attachment.url);
  const uploadingCount = fileAttachments.filter((attachment) => attachment.status === "uploading").length;
  const canSend = (composedPrompt.length > 0 || readyAttachments.length > 0) && uploadingCount === 0;
  const submittedPrompt = composedPrompt || (readyAttachments.length ? "Analise o anexo que enviei." : "");

  useEffect(() => {
    if (message) return; // pausa a rotação enquanto o usuário digita
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % placeholders.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [message, placeholders.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 104)}px`;
  }, [message]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, optimisticMessage, typedResponse, isSubmitting, loadingText, toolStatus, streamError]);

  useEffect(() => {
    if (!isSubmitting) {
      setLoadingText(loadingLabels[0]);
      return;
    }
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % loadingLabels.length;
      setLoadingText(loadingLabels[index]);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    setTypedResponse("");
    setTypedSetId(null);
    setTypedMaterialId(null);
    setTypedMessageId(null);
    setMessage(initialPrompt ?? "");
    setPastedBlocks([]);
    setFileAttachments([]);
    setIsSubmitting(false);
    setToolStatus(null);
    setStreamError(null);
    setStreamSessionId(null);
    setOptimisticMessage(null);
    setMobileHistoryOpen(false);
  }, [currentSessionId, initialPrompt]);

  useEffect(() => {
    if (!optimisticMessage) return;
    const alreadyArrived = messages.some(
      (chatMessage) => chatMessage.role === "USER" && chatMessage.content === optimisticMessage.content
    );
    if (alreadyArrived) setOptimisticMessage(null);
  }, [messages, optimisticMessage]);

  const activeSessionId = streamSessionId ?? currentSessionId;
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
  const hasConversation = displayMessages.length > 0 || Boolean(typedResponse) || isSubmitting || Boolean(streamError);

  function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && pastedBlocks.length) {
      setPastedBlocks([]);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    const isDesktopKeyboard = window.matchMedia("(pointer: fine)").matches;
    if (!isDesktopKeyboard) return;
    event.preventDefault();
    if (canSend) void handleSubmit();
  }

  async function uploadOneFile(file: File) {
    const localId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kind = attachmentKindFromMime(file.type);
    if (!kind) return;

    if (file.size > ATTACHMENT_LIMITS.maxBytes) {
      setFileAttachments((items) => [
        ...items,
        { id: localId, kind, name: file.name, mimeType: file.type, size: file.size, status: "error", error: `Máx. ${ATTACHMENT_LIMITS.maxMb}MB` }
      ]);
      return;
    }

    const previewUrl = kind === "IMAGE" ? URL.createObjectURL(file) : undefined;
    setFileAttachments((items) => [
      ...items,
      { id: localId, kind, name: file.name, mimeType: file.type, size: file.size, status: "uploading", previewUrl }
    ]);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Falha no upload.");
      setFileAttachments((items) =>
        items.map((item) =>
          item.id === localId
            ? { ...item, status: "ready", url: data.url, extractedText: data.extractedText, name: data.name ?? item.name }
            : item
        )
      );
    } catch (error) {
      setFileAttachments((items) =>
        items.map((item) =>
          item.id === localId ? { ...item, status: "error", error: error instanceof Error ? error.message : "Falha no upload." } : item
        )
      );
    }
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter((file) => attachmentKindFromMime(file.type));
    const slots = ATTACHMENT_LIMITS.maxPerMessage - fileAttachments.length;
    for (const file of incoming.slice(0, Math.max(0, slots))) {
      void uploadOneFile(file);
    }
  }

  function removeAttachment(id: string) {
    setFileAttachments((items) => {
      const target = items.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return items.filter((item) => item.id !== id);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => attachmentKindFromMime(file.type));
    if (imageFiles.length) {
      event.preventDefault();
      addFiles(imageFiles);
      return;
    }
    const text = event.clipboardData.getData("text");
    if (text.length <= PASTE_AS_ATTACHMENT_THRESHOLD) return;
    event.preventDefault();
    setPastedBlocks((blocks) => [...blocks, { id: `paste-${Date.now()}`, chars: text.length, text }]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragActive(false);
  }

  async function handleSubmit() {
    if (!canSend || isSubmitting) return;
    const promptToSend = submittedPrompt;
    const sessionToSend = activeSessionId;
    const attachmentsToSend = readyAttachments.map((attachment) => ({
      kind: attachment.kind,
      url: attachment.url,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      extractedText: attachment.extractedText
    }));

    setTypedResponse("");
    setTypedSetId(null);
    setTypedMaterialId(null);
    setTypedMessageId(null);
    setStreamError(null);
    setToolStatus(null);
    setOptimisticMessage({ id: `optimistic-${Date.now()}`, role: "USER", content: promptToSend });
    setIsSubmitting(true);
    setMessage("");
    setPastedBlocks([]);
    setFileAttachments([]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionToSend ?? undefined, prompt: promptToSend, attachments: attachmentsToSend })
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Falha ao enviar a mensagem.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const lines = block.split("\n");
          const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!event || !dataLine) continue;
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (event === "session") {
            setStreamSessionId(String(data.sessionId));
            if (data.sessionId && !currentSessionId) {
              window.history.replaceState(null, "", `/ai?sessionId=${data.sessionId}`);
            }
          } else if (event === "tool") {
            setToolStatus(TOOL_LABELS[String(data.name)] ?? "Trabalhando nisso…");
          } else if (event === "delta") {
            setIsSubmitting(false);
            setToolStatus(null);
            setTypedResponse((previous) => previous + String(data.text ?? ""));
          } else if (event === "done") {
            setTypedSetId((data.questionSetId as string | null) ?? null);
            setTypedMaterialId((data.studyMaterialId as string | null) ?? null);
            setTypedMessageId((data.messageId as string | null) ?? null);
            setIsSubmitting(false);
            setToolStatus(null);
            router.refresh();
          } else if (event === "error") {
            setStreamError(String(data.error ?? "Erro ao enviar a mensagem."));
            setIsSubmitting(false);
            setToolStatus(null);
          }
        }
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Erro ao enviar a mensagem.");
      setIsSubmitting(false);
      setToolStatus(null);
    }
  }

  const sessionList = (
    <SessionList
      sessions={sessions}
      activeSessionId={activeSessionId}
      onNavigate={() => setMobileHistoryOpen(false)}
    />
  );

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
            <Link href="/ai?new=1" title="Novo chat">
              <MessageSquarePlus className="h-4 w-4" />
              {sidebarOpen && "Novo chat"}
            </Link>
          </Button>
        </div>

        {sidebarOpen ? sessionList : <div className="flex-1" />}
      </aside>

      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar histórico"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileHistoryOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
              <span className="text-sm font-semibold">Chats</span>
              <Button variant="ghost" size="icon" title="Fechar histórico" onClick={() => setMobileHistoryOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-2">
              <Button asChild variant="outline" className="w-full" onClick={() => setMobileHistoryOpen(false)}>
                <Link href="/ai?new=1">
                  <MessageSquarePlus className="h-4 w-4" />
                  Novo chat
                </Link>
              </Button>
            </div>
            {sessionList}
          </div>
        </div>
      )}

      <main
        className="relative flex min-w-0 flex-1 flex-col"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-30 m-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)]/80 backdrop-blur-sm">
            <Paperclip className="h-7 w-7 text-[var(--primary)]" />
            <p className="text-sm font-semibold text-[var(--primary-soft-foreground)]">Solte imagens ou PDFs para anexar</p>
          </div>
        )}
        {/* Controles flutuantes no mobile — liberam a altura antes ocupada pelo subheader */}
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2 md:hidden">
          <button
            type="button"
            aria-label="Abrir histórico de chats"
            onClick={() => setMobileHistoryOpen(true)}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-sm backdrop-blur"
          >
            <History className="h-4 w-4" />
          </button>
          <Link
            href="/ai?new=1"
            aria-label="Novo chat"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-sm backdrop-blur"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Link>
        </div>

        <section className={cn("min-h-0 flex-1 overflow-y-auto px-4", hasConversation ? "pb-6 pt-14 md:pt-6" : "grid place-items-center py-8")}>
          {!hasConversation ? (
            <div className="w-full max-w-3xl text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
                <Bot className="h-6 w-6 text-[var(--primary)]" />
              </div>
              <h1 className="text-2xl font-light text-[var(--foreground)] sm:text-3xl md:text-4xl">O que vamos gerar hoje, {firstName(userName)}?</h1>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                Peça questões, simulados ou revisões. A IA organiza os detalhes automaticamente.
              </p>
              <div className="mt-6 grid gap-2 text-left sm:mt-8 sm:grid-cols-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setMessage(prompt);
                      window.setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-sm hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] active:bg-[var(--primary-soft)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-36 md:pb-32">
              {displayMessages.map((chatMessage) => (
                <ChatBubble key={chatMessage.id} message={chatMessage} />
              ))}
              {typedResponse && (
                <div className="max-w-[88%] rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                  <MarkdownContent content={typedResponse} compact />
                  {(typedSetId || typedMaterialId) && typedMessageId && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {typedSetId && (
                        <Button asChild size="sm">
                          <Link href={`/biblioteca?setId=${typedSetId}`}>
                            <Play className="h-4 w-4" />
                            Responder agora
                          </Link>
                        </Button>
                      )}
                      {typedMaterialId && (
                        <Button asChild size="sm">
                          <Link href={`/materiais/${typedMaterialId}`}>
                            <FileText className="h-4 w-4" />
                            Abrir material
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="flex max-w-[88%] items-center gap-3 rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                    <Loader variant="text-shimmer" text={toolStatus ?? loadingText} />
                  </div>
                </div>
              )}
              {streamError && !isSubmitting && (
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-4 text-sm leading-6 text-[var(--danger-soft-foreground)]">
                    {streamError}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-20 shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <UsageNotice usage={usage} />

          <form
            className="mx-auto max-w-3xl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              {(fileAttachments.length > 0 || pastedBlocks.length > 0) && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {fileAttachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className={cn(
                        "animate-fade-in flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                        attachment.status === "error"
                          ? "border-[var(--danger-soft-border)] bg-[var(--danger-soft)] text-[var(--danger-soft-foreground)]"
                          : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--foreground)]"
                      )}
                    >
                      {attachment.kind === "IMAGE" && attachment.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachment.previewUrl} alt={attachment.name} className="h-6 w-6 rounded object-cover" />
                      ) : attachment.kind === "IMAGE" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      )}
                      <span className="max-w-[140px] truncate">{attachment.name}</span>
                      {attachment.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" />}
                      {attachment.status === "error" && <span className="text-[10px]">{attachment.error}</span>}
                      <button
                        type="button"
                        aria-label="Remover anexo"
                        onClick={() => removeAttachment(attachment.id)}
                        className="rounded-full p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {pastedBlocks.map((block) => (
                    <span
                      key={block.id}
                      className="animate-fade-in flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      Texto colado · {block.chars.toLocaleString("pt-BR")} caracteres
                      <button
                        type="button"
                        aria-label="Remover texto colado"
                        onClick={() => setPastedBlocks((blocks) => blocks.filter((item) => item.id !== block.id))}
                        className="rounded-full p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={submitFromKeyboard}
                onPaste={handlePaste}
                rows={1}
                placeholder={placeholders[placeholderIndex % placeholders.length]}
                className="min-h-[68px] w-full resize-none border-0 bg-transparent p-4 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] md:min-h-[74px]"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <button
                  type="button"
                  aria-label="Anexar imagem ou PDF"
                  title="Anexar imagem ou PDF"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <ChatSubmitButton canSend={canSend} pending={isSubmitting || uploadingCount > 0} />
              </div>
            </div>
          </form>
          <p className="mx-auto mt-3 max-w-3xl px-1 text-xs text-[var(--muted-foreground)]">
            Anexe prints ou PDFs (clipe, colar ou arrastar), cole um texto longo como contexto, ou peça algo como “revisão dos meus erros de informática”.
          </p>
        </div>
      </main>
    </div>
  );
}

function SessionList({
  sessions,
  activeSessionId,
  onNavigate
}: {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
      {sessions.length === 0 && (
        <p className="px-2 py-3 text-xs text-[var(--muted-foreground)]">Nenhum chat ainda. Comece uma conversa.</p>
      )}
      {sessions.map((session) => (
        <div
          key={session.id}
          className={cn(
            "group rounded-md border border-transparent",
            activeSessionId === session.id && "border-[var(--border)] bg-[var(--muted)]"
          )}
        >
          <div className="flex items-center gap-1">
            <Link
              href={`/ai?sessionId=${session.id}`}
              onClick={onNavigate}
              className="min-w-0 flex-1 rounded-md px-2 py-2 text-sm hover:bg-[var(--muted)] active:bg-[var(--muted)]"
            >
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
        </div>
      ))}
    </div>
  );
}

function UsageNotice({ usage }: { usage: { used: number; limit: number | null; percent: number } }) {
  if (!usage.limit || usage.percent < 80) return null;
  const tone =
    usage.percent >= 100
      ? "border-[var(--danger-soft-border)] bg-[var(--danger-soft)] text-[var(--danger-soft-foreground)]"
      : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]";
  const message =
    usage.percent >= 100
      ? "Você atingiu 100% do seu limite diário de uso da IA."
      : `Você já usou ${usage.percent}% do limite diário de IA (${usage.used}/${usage.limit}).`;
  return <div className={cn("mx-auto mb-3 max-w-3xl rounded-lg border p-3 text-sm", tone)}>{message}</div>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] rounded-lg p-4 text-sm leading-6", isUser ? "bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow-sm)]" : "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]")}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => {
              const proxied = blobProxyUrl(attachment.url);
              return attachment.kind === "IMAGE" ? (
                <a key={attachment.id} href={proxied} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxied} alt={attachment.name} className="h-28 w-28 rounded-md border border-[var(--border)] object-cover" />
                </a>
              ) : (
                <a
                  key={attachment.id}
                  href={proxied}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:border-[var(--primary)]"
                >
                  <FileText className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <span className="max-w-[160px] truncate">{attachment.name}</span>
                </a>
              );
            })}
          </div>
        )}
        <MarkdownContent content={message.content} compact />
        {(message.questionSetId || message.studyMaterialId) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.questionSetId && (
              <Button asChild size="sm">
                <Link href={`/biblioteca?setId=${message.questionSetId}`}>
                  <Play className="h-4 w-4" />
                  Responder agora
                </Link>
              </Button>
            )}
            {message.studyMaterialId && (
              <Button asChild size="sm">
                <Link href={`/materiais/${message.studyMaterialId}`}>
                  <FileText className="h-4 w-4" />
                  Abrir material
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

function ChatSubmitButton({ canSend, pending }: { canSend: boolean; pending: boolean }) {
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
