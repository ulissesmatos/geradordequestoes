"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Bot,
  BookOpen,
  Check,
  FileText,
  History,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Share2,
  Sparkles,
  Timer,
  Trash2,
  X
} from "lucide-react";
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState, useMemo, useTransition } from "react";
import {
  deleteChatSessionAction,
  renameChatSessionAction,
  revokeChatShareAction,
  shareChatSessionAction
} from "@/app/(app)/actions/chat-actions";
import { BotAvatar } from "@/components/bot-avatar";
import { MarkdownContent } from "@/components/markdown-content";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { ShareLinkModal } from "@/components/share-link-modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ShiningText } from "@/components/ui/shining-text";
import { MessageLoading } from "@/components/ui/message-loading";
import { dayKeyInBrazil, hourInBrazil } from "@/lib/dates";
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMITS, attachmentKindFromMime, blobProxyUrl, type AttachmentKindValue } from "@/lib/uploads";
// `import type` é apagado na compilação — nada de ledger.ts (Prisma, servidor) entra no bundle.
import type { QuotaAlert } from "@/lib/usage/ledger";
import { cn } from "@/lib/utils";

type ChatAttachment = {
  id: string;
  kind: AttachmentKindValue;
  url: string;
  name: string;
};

type ChatSource = { title: string; url: string };

type ClarifyOption = { label: string; description?: string };
type Clarification = { question: string; options: ClarifyOption[]; allowFreeText: boolean };

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  questionSetId?: string | null;
  studyMaterialId?: string | null;
  sources?: ChatSource[];
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

type UploadResponsePayload = {
  url?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  extractedText?: string;
  error?: string;
};

type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  /** Link ativo de compartilhamento desta sessão, se houver (já computado no servidor). */
  shareUrl: string | null;
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

// Mesma ordem de buildQuickPrompts (questões / simulado / revisão / material) — índice fixo
// em vez de guardar o ícone junto do texto, porque o texto muda (matéria sorteada) e a
// categoria, não.
const QUICK_PROMPT_ICONS = [ListChecks, Timer, History, BookOpen];

/**
 * Saudação + sugestão do empty state variam por horário (fuso de Brasília) — pedido
 * explícito pra deixar a tela inicial do chat menos estática e mais convidativa a
 * qualquer hora do dia.
 */
function greetingForHour(hour: number, name: string): { headline: string; subtext: string } {
  if (hour >= 5 && hour < 12) {
    return { headline: `Bom dia, ${name}!`, subtext: "Comece o dia com um bloco de questões antes da correria." };
  }
  if (hour >= 12 && hour < 18) {
    return { headline: `Boa tarde, ${name}!`, subtext: "Aproveite a tarde para avançar na sua sequência de estudos." };
  }
  if (hour >= 18 && hour < 24) {
    return { headline: `Boa noite, ${name}!`, subtext: "Fechando o dia? Um bloco rápido ainda cabe antes de descansar." };
  }
  return { headline: `Ainda por aqui, ${name}?`, subtext: "Uma revisão rápida agora ajuda a fixar o conteúdo antes de dormir." };
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

async function readUploadResponse(response: Response): Promise<UploadResponsePayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json().catch(() => ({}))) as UploadResponsePayload;
  }

  await response.text().catch(() => "");
  if (response.status >= 500) {
    return { error: "Falha interna no upload. Tente novamente em instantes." };
  }
  return { error: "Falha no upload. Tente enviar o arquivo novamente." };
}

/**
 * Fallback: hoje o servidor envia a frase pronta (com matéria/assunto/termo de busca reais)
 * no campo `label`. Este mapa cobre o caso de um cliente aberto durante um deploy, quando o
 * backend antigo ainda manda só o nome. web_search e search_reference_material faltavam aqui
 * e caíam no genérico "Trabalhando nisso…".
 */
const TOOL_LABELS: Record<string, string> = {
  generate_questions: "Gerando suas questões…",
  generate_review_from_mistakes: "Montando sua revisão…",
  generate_study_material: "Escrevendo o material…",
  get_performance: "Consultando seu desempenho…",
  get_study_history: "Consultando seu histórico…",
  get_question_set_results: "Buscando o resultado do seu bloco…",
  search_reference_material: "Consultando provas e materiais cadastrados…",
  web_search: "Buscando informações atualizadas na web…",
  ask_clarifying_question: "Preparando uma pergunta…"
};

export function AiChatDashboard({
  userName,
  currentSessionId,
  usage,
  quotaAlert = null,
  sessions,
  messages,
  initialPrompt,
  subjectNames,
  isAdmin = false,
  canAttach = true,
  initialSidebarOpen = true,
  banner,
  streak,
  streakActiveToday = false
}: {
  userName: string;
  currentSessionId: string | null;
  usage: { used: number; limit: number | null; percent: number; resetsAt?: string | null; isTrial?: boolean };
  /**
   * Aviso do medidor novo. Só vem preenchido com o enforcement LIGADO — em modo sombra o
   * aviso que vale é o legado (`usage`), porque é o limite legado que ainda bloqueia.
   */
  quotaAlert?: QuotaAlert | null;
  sessions: ChatSessionSummary[];
  messages: ChatMessage[];
  initialPrompt?: string;
  subjectNames?: string[];
  isAdmin?: boolean;
  /** Capability `chatAttachments`. Cosmético — quem barra de verdade é o servidor. */
  canAttach?: boolean;
  initialSidebarOpen?: boolean;
  banner?: React.ReactNode;
  /** Dias seguidos de estudo, mostrado na mini-header mobile (ver MobileTopBar). undefined esconde o badge. */
  streak?: number;
  streakActiveToday?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(initialPrompt ?? "");
  const [pastedBlocks, setPastedBlocks] = useState<{ id: string; chars: number; text: string }[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [typedResponse, setTypedResponse] = useState("");
  const [typedSetId, setTypedSetId] = useState<string | null>(null);
  const [typedMaterialId, setTypedMaterialId] = useState<string | null>(null);
  const [typedSources, setTypedSources] = useState<ChatSource[]>([]);
  const [typedMessageId, setTypedMessageId] = useState<string | null>(null);
  const [typedClarification, setTypedClarification] = useState<Clarification | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Progresso do turno: a TAREFA em andamento e os PASSOS já percorridos dentro dela.
   *
   * São coisas diferentes e misturá-las invertia o sentido: "Gerando 10 questões" ganhava um
   * check assim que o primeiro passo chegava, ou seja, aparecia como concluída antes de
   * qualquer questão existir. A tarefa fica no topo, rodando; os passos entram abaixo dela.
   */
  const [progress, setProgress] = useState<{ task: string | null; steps: string[] }>({ task: null, steps: [] });
  /** Instante em que o turno começou, para o contador de tempo decorrido. */
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(loadingLabels[0]);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicializa vazio para SSR determinístico; useEffect (cliente-only) randomiza após hidratação.
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  useEffect(() => {
    setQuickPrompts(buildQuickPrompts(subjectNames));
    setPlaceholders(buildPlaceholders(subjectNames));
  }, [subjectNames]);
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
  }, [messages, optimisticMessage, typedResponse, isSubmitting, loadingText, progress, streamError]);


  useEffect(() => {
    if (!isSubmitting) {
      setLoadingText(loadingLabels[0]);
      return;
    }
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % loadingLabels.length;
      setLoadingText(loadingLabels[index]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    setTypedResponse("");
    setTypedSetId(null);
    setTypedMaterialId(null);
    setTypedSources([]);
    setTypedMessageId(null);
    setTypedClarification(null);
    setMessage(initialPrompt ?? "");
    setPastedBlocks([]);
    setFileAttachments([]);
    setIsSubmitting(false);
    setTurnStartedAt(null);
    setProgress({ task: null, steps: [] });
    setStreamError(null);
    setStreamSessionId(null);
    setOptimisticMessage(null);
    setMobileMenuOpen(false);
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
      const data = await readUploadResponse(response);
      if (!response.ok) throw new Error(data?.error ?? "Falha no upload.");
      if (!data.url) throw new Error("Upload concluído sem URL do arquivo.");
      setFileAttachments((items) =>
        items.map((item) =>
          item.id === localId
            ? {
                ...item,
                status: "ready",
                url: data.url,
                extractedText: data.extractedText,
                name: data.name ?? item.name,
                mimeType: data.mimeType ?? item.mimeType,
                size: data.size ?? item.size
              }
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

  async function handleSubmit(overridePrompt?: string) {
    if (isSubmitting) return;
    if (!overridePrompt && !canSend) return;
    const promptToSend = overridePrompt ?? submittedPrompt;
    const sessionToSend = activeSessionId;
    const attachmentsToSend = overridePrompt
      ? []
      : readyAttachments.map((attachment) => ({
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
    setTypedSources([]);
    setTypedMessageId(null);
    setTypedClarification(null);
    setStreamError(null);
    setProgress({ task: null, steps: [] });
    setOptimisticMessage({ id: `optimistic-${Date.now()}`, role: "USER", content: promptToSend });
    setTurnStartedAt(Date.now());
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
          } else if (event === "discard") {
            // O texto transmitido era o modelo narrando o que ia fazer antes de chamar a
            // ferramenta, não a resposta. Sem limpar, essa narração ficava colada na resposta
            // final na tela — e sumia ao recarregar, porque não é ela que fica salva.
            setTypedResponse("");
            setIsSubmitting(true);
            // O primeiro delta zerou o cronômetro (chegou texto = parou de esperar); como
            // voltamos a esperar, retoma sem perder a contagem original quando ela existir.
            setTurnStartedAt((previous) => previous ?? Date.now());
          } else if (event === "tool") {
            // O servidor manda a frase pronta com os argumentos reais da ferramenta
            // ("Gerando 20 questões de Direito Constitucional…"). TOOL_LABELS só cobre
            // versão antiga do backend, que não enviava label.
            const label =
              (typeof data.label === "string" && data.label) || TOOL_LABELS[String(data.name)] || "Trabalhando nisso…";
            setProgress((previous) => {
              // Tarefa nova zera os passos: são os passos DAQUELA tarefa. Backend antigo (sem
              // `phase`) cai aqui e continua funcionando como antes.
              if (data.phase !== "step") return { task: label, steps: [] };
              // Passo repetido não vira linha nova: a lista conta o que MUDOU, não quantos
              // eventos chegaram.
              if (previous.steps[previous.steps.length - 1] === label) return previous;
              return { ...previous, steps: [...previous.steps, label] };
            });
          } else if (event === "delta") {
            setIsSubmitting(false);
            setTurnStartedAt(null);
            setProgress({ task: null, steps: [] });
            setTypedResponse((previous) => previous + String(data.text ?? ""));
          } else if (event === "done") {
            setTypedSetId((data.questionSetId as string | null) ?? null);
            setTypedMaterialId((data.studyMaterialId as string | null) ?? null);
            setTypedSources(Array.isArray(data.sources) ? (data.sources as ChatSource[]) : []);
            setTypedMessageId((data.messageId as string | null) ?? null);
            setTypedClarification((data.clarification as Clarification | null) ?? null);
            setIsSubmitting(false);
            setTurnStartedAt(null);
            setProgress({ task: null, steps: [] });
            router.refresh();
          } else if (event === "error") {
            setStreamError(String(data.error ?? "Erro ao enviar a mensagem."));
            setIsSubmitting(false);
            setTurnStartedAt(null);
            setProgress({ task: null, steps: [] });
          }
        }
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Erro ao enviar a mensagem.");
      setIsSubmitting(false);
      setTurnStartedAt(null);
      setProgress({ task: null, steps: [] });
    }
  }

  const activeSession = sessions.find((item) => item.id === activeSessionId);
  const activeSessionTitle = activeSession?.title ?? "Chat IA";

  const sessionList = (
    <SessionList
      sessions={sessions}
      activeSessionId={activeSessionId}
      onNavigate={() => setMobileMenuOpen(false)}
    />
  );

  const greeting = greetingForHour(hourInBrazil(), firstName(userName));

  const composer = (
    <>
      {quotaAlert ? <QuotaAlertNotice alert={quotaAlert} /> : <UsageNotice usage={usage} />}

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
                    "animate-fade-in flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
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
                  {attachment.status === "error" && (
                    <span className="max-w-[220px] truncate text-[10px]" title={attachment.error}>
                      {attachment.error}
                    </span>
                  )}
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
            {canAttach ? (
              <button
                type="button"
                aria-label="Anexar imagem ou PDF"
                title="Anexar imagem ou PDF"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
              >
                <Paperclip className="h-5 w-5" />
              </button>
            ) : (
              // Vira convite em vez de sumir: a pessoa precisa descobrir que a
              // funcionalidade existe para querer assinar por ela.
              <Link
                href="/assinatura"
                title="Enviar PDF ou imagem está disponível nos planos pagos"
                className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
              >
                <Paperclip className="h-4 w-4" />
                Anexar arquivo (planos pagos)
              </Link>
            )}
            <ChatSubmitButton canSend={canSend} pending={isSubmitting || uploadingCount > 0} />
          </div>
        </div>
      </form>
    </>
  );

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] -my-8 flex h-[100svh] w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] md:h-[calc(100vh-73px)]">
      <aside
        className={cn(
          "hidden border-r border-[var(--border)] bg-[var(--surface-subtle)] transition-all duration-200 md:flex md:flex-col",
          sidebarOpen ? "w-72" : "w-14"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
          {sidebarOpen && <span className="text-sm font-semibold">Chats</span>}
          <Button
            variant="ghost"
            size="icon"
            title={sidebarOpen ? "Recolher histórico" : "Abrir histórico"}
            onClick={() =>
              setSidebarOpen((value) => {
                const next = !value;
                // Persiste a preferência entre reloads; lida no server em ai/page.tsx.
                document.cookie = `ai-sidebar=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
                return next;
              })
            }
          >
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

      {/* Drawer mobile único, compartilhado com o resto do app (ver AppNav) — mesmo padrão em
          toda página, com o histórico de conversas entrando no meio (middleSlot). */}
      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        userName={userName}
        isAdmin={isAdmin}
        showUpgrade={Boolean(usage.isTrial)}
        middleSlot={
          <div className="pt-1">
            <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Recentes</p>
            {sessionList}
          </div>
        }
      />

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
        {/* Mini-header mobile compartilhado com o resto do app (ver AppNav) — aqui o título é a
            conversa ativa em vez do nome da página. Compartilhar mora no "..." de cada conversa
            na sidebar — não precisa de uma barra própria aqui. */}
        <MobileTopBar
          title={activeSessionTitle}
          onOpenMenu={() => setMobileMenuOpen(true)}
          streak={streak}
          streakActiveToday={streakActiveToday}
        />

        {banner && <div className="shrink-0 px-4 pt-3 md:px-6 [&>*]:mb-0">{banner}</div>}

        <section className={cn("min-h-0 flex-1 overflow-y-auto px-4", hasConversation ? "pb-6 pt-4 md:pt-6" : "flex items-center justify-center py-8")}>
          {!hasConversation ? (
            // Estilo Claude web: saudação + composer centralizados na tela (não presos embaixo),
            // sugestões como chips logo abaixo — em vez do bloco de texto + grid de cards + input
            // fixo no rodapé que existia antes.
            <div className="w-full max-w-3xl text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
                <Bot className="h-6 w-6 text-[var(--primary)]" />
              </div>
              <h1 className="text-2xl font-light text-[var(--foreground)] sm:text-3xl md:text-4xl">{greeting.headline}</h1>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">{greeting.subtext}</p>

              {/* text-left contra o text-center do wrapper — senão o texto digitado no textarea
                  (e o resto do composer) herdava o alinhamento centralizado da saudação. */}
              <div className="mt-6 text-left sm:mt-8">{composer}</div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {quickPrompts.map((prompt, index) => {
                  const Icon = QUICK_PROMPT_ICONS[index % QUICK_PROMPT_ICONS.length];
                  return (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setMessage(prompt);
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-medium text-[var(--foreground)] shadow-sm hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] active:bg-[var(--primary-soft)]"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                      {prompt}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-36 md:pb-32">
              {displayMessages.map((chatMessage) => (
                <ChatBubble key={chatMessage.id} message={chatMessage} />
              ))}
              {typedResponse && (
                <div className="flex animate-fade-in items-start justify-start gap-2.5">
                  <BotAvatar />
                  <div className="flex min-w-0 max-w-[88%] flex-1 flex-col gap-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--foreground)] shadow-[var(--shadow-sm)]">
                      <MarkdownContent content={typedResponse} compact />
                      <SourceLinks sources={typedSources} />
                    </div>
                    {typedMessageId && <ResultCard questionSetId={typedSetId} studyMaterialId={typedMaterialId} />}
                    {typedClarification && !isSubmitting && (
                      <ClarifyCard clarification={typedClarification} disabled={isSubmitting} onPick={(text) => void handleSubmit(text)} />
                    )}
                  </div>
                </div>
              )}
              {isSubmitting && (
                <div className="flex items-start justify-start gap-2.5">
                  <BotAvatar />
                  <ProgressSteps
                    task={progress.task ?? loadingText}
                    steps={progress.steps}
                    startedAt={turnStartedAt}
                  />
                </div>
              )}
              {streamError && !isSubmitting && (
                <div className="flex items-start justify-start gap-2.5">
                  <BotAvatar />
                  <div className="max-w-[88%] rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-4 text-sm leading-6 text-[var(--danger-soft-foreground)]">
                    {streamError}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {/* Vazio: o composer já está centralizado dentro do <section> acima, junto da saudação
            (ver `composer`/greeting). Com conversa: volta a ficar fixo embaixo, como um chat normal. */}
        {hasConversation && (
          <div className="sticky bottom-0 z-20 shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            {composer}
          </div>
        )}
      </main>
    </div>
  );
}


function SessionRow({
  session,
  isActive,
  onNavigate
}: {
  session: ChatSessionSummary;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  function cancelRenaming() {
    setRenaming(false);
    setDraftTitle(session.title);
  }

  function handleDeleteConfirm() {
    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.set("sessionId", session.id);
      formData.set("isActive", isActive ? "true" : "false");
      await deleteChatSessionAction(formData);
      setDeleteOpen(false);
    });
  }

  return (
    <div
      className={cn(
        "group rounded-md border border-transparent transition-colors",
        isActive ? "border-[var(--border)] bg-[var(--muted)]" : "hover:bg-[var(--surface)]"
      )}
    >
      {renaming ? (
        <form action={renameChatSessionAction} className="flex items-center gap-1 p-1" onSubmit={() => setRenaming(false)}>
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            ref={renameInputRef}
            name="title"
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              cancelRenaming();
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          <button type="submit" title="Salvar" aria-label="Salvar novo título" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--surface)]">
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Cancelar"
            aria-label="Cancelar renomeação"
            onClick={cancelRenaming}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <Link
            href={`/ai?sessionId=${session.id}`}
            onClick={onNavigate}
            className="block min-w-0 flex-1 rounded-md px-2 py-2 text-sm"
          >
            <span className="block truncate">{session.title}</span>
          </Link>
          <DropdownMenu
            ariaLabel="Mais opções da conversa"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            portal
            trigger={<MoreHorizontal className="h-3.5 w-3.5" />}
            triggerClassName={cn(
              "shrink-0 rounded-md p-2 text-[var(--muted-foreground)] transition-opacity hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
              "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              (isActive || menuOpen) && "md:opacity-100"
            )}
            panelClassName="w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setDraftTitle(session.title);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
            >
              <Pencil className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span>Renomear</span>
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
            >
              <Share2 className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span>Compartilhar</span>
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
            >
              <Trash2 className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span>Excluir</span>
            </button>
          </DropdownMenu>
        </div>
      )}

      {/* Fora do painel do dropdown de propósito: se ficasse dentro, fechar o menu
          desmontaria a confirmação/o modal de compartilhar antes do clique ser processado. */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir chat"
        description="Os blocos e questões gerados serão mantidos no histórico."
        confirmLabel="Excluir"
        onConfirm={handleDeleteConfirm}
        pending={deletePending}
      />

      <ShareLinkModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Compartilhar conversa"
        description="Cópia somente-leitura, congelada agora. Quem tiver o link não vê mensagens trocadas depois."
        revokedNotice="Link revogado — quem já tinha o link não consegue mais abrir."
        initialShareUrl={session.shareUrl}
        createAction={shareChatSessionAction.bind(null, session.id)}
        revokeAction={revokeChatShareAction.bind(null, session.id)}
      />
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
        <SessionRow
          key={session.id}
          session={session}
          isActive={activeSessionId === session.id}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

/**
 * Tempo decorrido do turno. Serve para o usuário distinguir "está trabalhando" de "travou" em
 * geração longa (um lote de 20 questões sai de uma única chamada e pode levar bem mais de um
 * minuto). Só aparece depois de DELAY_MS para não poluir resposta rápida.
 *
 * Não é barra de progresso de propósito: o modelo devolve o lote inteiro numa resposta só, então
 * não existe percentual real para mostrar — e inventar um seria mentir para o usuário.
 */
/**
 * Passos do turno em lista acumulada, no lugar de uma frase que se substitui.
 *
 * Numa geração longa (bloco de 50 leva ~2 min) a frase única parecia tela travada: ela
 * trocava a cada 20-30s e o que já tinha acontecido sumia. Com a lista, o usuário vê o
 * caminho percorrido — é isso que comunica que há trabalho em andamento.
 *
 * Todo passo vem de fato do servidor (argumentos reais da ferramenta, lote atual, acervo
 * consultado). Nada é inventado no cliente, e nada é gerado por IA só para preencher tela.
 */
function ProgressSteps({ task, steps, startedAt }: { task: string; steps: string[]; startedAt: number | null }) {
  const lastIndex = steps.length - 1;

  return (
    <div className="max-w-[88%] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 shadow-[var(--shadow-sm)]">
      {/* A TAREFA sempre roda: ela só termina quando o card inteiro some, dando lugar à
          resposta. Marcá-la com check enquanto os passos correm era o que invertia o sentido. */}
      <div className="flex items-start gap-2">
        <Loader2 className="mt-[5px] h-3.5 w-3.5 shrink-0 animate-spin text-[var(--primary)]" />
        <span className="flex flex-wrap items-center gap-2">
          <ShiningText text={task} />
          {startedAt !== null && <ElapsedTime startedAt={startedAt} />}
        </span>
      </div>

      {steps.length > 0 && (
        <ul className="mt-1.5 space-y-1 border-l border-[var(--border)] pl-4">
          {steps.map((step, index) => {
            const isCurrent = index === lastIndex;
            return (
              <li key={`${index}-${step}`} className="flex items-start gap-2 text-xs">
                <span className="mt-[5px] flex h-3 w-3 shrink-0 items-center justify-center">
                  {isCurrent ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
                  ) : (
                    <Check className="h-3 w-3 text-[var(--success)]" />
                  )}
                </span>
                <span className={isCurrent ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>
                  {step}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const DELAY_MS = 6000;
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (seconds * 1000 < DELAY_MS) return null;
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  return <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{label}</span>;
}

function hoursUntil(iso: string | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 3_600_000));
}

function usageDismissKey() {
  // Chave por dia de Brasília, mesmo corte do reset da cota — com o dia em UTC o aviso
  // reaparecia às 21h, no meio da noite de estudo, sem a cota ter virado.
  return `ai-usage-notice-dismissed:${dayKeyInBrazil()}`;
}

/**
 * Aviso dos degraus de cota (50/75/90/100%) do medidor novo.
 *
 * A dispensa é por DEGRAU, não por dia: dispensar o aviso de 50% não pode silenciar o de 75%,
 * senão o usuário atravessa a cota inteira em silêncio depois de um clique distraído. Cada
 * degrau novo é um aviso novo, e o de 100% não é dispensável.
 */
function quotaAlertDismissKey(step: number) {
  return `ai-quota-alert-dismissed:${dayKeyInBrazil()}:${step}`;
}

function QuotaAlertNotice({ alert }: { alert: QuotaAlert }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(quotaAlertDismissKey(alert.step)) === "1");
    } catch {
      // sessionStorage indisponível (SSR/modo restrito): mantém visível
    }
  }, [alert.step]);

  const exhausted = alert.step === 100;
  if (!exhausted && dismissed) return null;

  const isChat = alert.meter === "CHAT";
  const unit = isChat ? "mensagens e ações de IA" : "questões";
  const window = alert.scope === "day" ? "de hoje" : "deste ciclo";
  const remaining = Math.max(0, alert.limit - alert.used);
  const resetHours = hoursUntil(alert.resetsAt);
  const upgradeHref = alert.kind === "TRIAL" ? "/assinatura" : "/pricing";
  const upgradeLabel = alert.kind === "TRIAL" ? "Assinar agora" : "Fazer upgrade";
  // Convite para upgrade só nos degraus altos: virar "metade da cota" em pitch de venda faz o
  // aluno aprender a ignorar o aviso antes de ele passar a importar.
  const showUpgrade = alert.step >= 90;

  return (
    <div
      className={cn(
        "mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm",
        exhausted
          ? "border-[var(--danger-soft-border)] bg-[var(--danger-soft)] text-[var(--danger-soft-foreground)]"
          : alert.step >= 75
            ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
            : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--foreground)]"
      )}
    >
      <span>
        {exhausted ? (
          <>
            Sua cota de <strong>{unit}</strong> {window} acabou ({alert.used}/{alert.limit}).
          </>
        ) : (
          <>
            Você já usou <strong>{alert.percent}%</strong> da sua cota de {unit} {window} ({alert.used}/{alert.limit}) —
            restam <strong>{remaining}</strong>.
          </>
        )}
        {resetHours !== null && <> Renova em cerca de <strong>{resetHours}h</strong>.</>}
      </span>

      {showUpgrade ? (
        <Link
          href={upgradeHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[var(--primary)] to-[#14a89a] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(10,98,104,0.5)] hover:opacity-90"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {upgradeLabel}
        </Link>
      ) : (
        <button
          type="button"
          aria-label="Dispensar aviso"
          className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(quotaAlertDismissKey(alert.step), "1");
            } catch {
              // sem persistência, dispensa só nesta renderização
            }
          }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function UsageNotice({ usage }: { usage: { used: number; limit: number | null; percent: number; resetsAt?: string | null; isTrial?: boolean } }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(usageDismissKey()) === "1");
    } catch {
      // sessionStorage indisponível (SSR/modo restrito): mantém visível
    }
  }, []);

  if (!usage.limit || usage.percent < 80) return null;
  const exhausted = usage.percent >= 100;
  // Aviso parcial pode ser dispensado; aos 100% volta a aparecer sempre.
  if (!exhausted && dismissed) return null;

  const isTrial = usage.isTrial;
  const resetHours = hoursUntil(usage.resetsAt ?? undefined);

  if (exhausted) {
    return (
      <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
        <span>
          {isTrial ? (
            <>
              Você usou todas as suas <strong>{usage.limit}</strong> mensagens/gerações grátis deste mês.
              {resetHours !== null && <> O limite renova em cerca de <strong>{resetHours}h</strong>.</>} Assine um plano para continuar agora.
            </>
          ) : (
            <>
              Você atingiu 100% do seu limite diário de uso da IA.
              {resetHours !== null && <> O limite renova em cerca de <strong>{resetHours}h</strong>.</>}
            </>
          )}
        </span>
        <Link
          href="/pricing"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[var(--primary)] to-[#14a89a] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(10,98,104,0.5)] hover:opacity-90"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isTrial ? "Assinar agora" : "Fazer upgrade"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning-soft-foreground)]">
      <span>
        {isTrial
          ? `Você já usou ${usage.used} das ${usage.limit} mensagens/gerações grátis deste mês.`
          : `Você já usou ${usage.percent}% do limite diário de IA (${usage.used}/${usage.limit}).`}
      </span>
      <button
        type="button"
        aria-label="Dispensar aviso"
        className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(usageDismissKey(), "1");
          } catch {
            // sem persistência, dispensa só nesta renderização
          }
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fontes consultadas (busca web) como ícones de link clicáveis. */
function SourceLinks({ sources }: { sources?: ChatSource[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--primary-soft-foreground)]/15 pt-2">
      <span className="text-xs font-medium text-[var(--primary-soft-foreground)]/70">Fontes:</span>
      {sources.map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          title={source.title}
          className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-[var(--primary-soft-foreground)]/20 bg-[var(--surface)]/40 px-2 py-0.5 text-xs text-[var(--primary-soft-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{hostOf(source.url)}</span>
        </a>
      ))}
    </div>
  );
}

/** Cartão de entrega (bloco/material gerado) — separado do texto de confirmação, com destaque âmbar. */
function ResultCard({
  questionSetId,
  studyMaterialId
}: {
  questionSetId?: string | null;
  studyMaterialId?: string | null;
}) {
  if (!questionSetId && !studyMaterialId) return null;
  return (
    <div
      data-testid="chat-result-card"
      className="flex flex-col gap-2 rounded-lg border border-l-4 border-[var(--border)] border-l-[#fbe8ba] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]"
    >
      {questionSetId && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--foreground)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-foreground)]">
              <Play className="h-3.5 w-3.5" />
            </span>
            Questões geradas
          </div>
          <Button asChild size="sm">
            <Link href={`/biblioteca?setId=${questionSetId}`}>Responder agora</Link>
          </Button>
        </div>
      )}
      {studyMaterialId && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--foreground)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-foreground)]">
              <FileText className="h-3.5 w-3.5" />
            </span>
            Material gerado
          </div>
          <Button asChild size="sm">
            <Link href={`/materiais/${studyMaterialId}`}>Abrir material</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Pergunta de esclarecimento da IA (uso esporádico — só quando ela tem dúvida real):
 * opções clicáveis + campo de texto livre opcional. Escolher uma opção ou escrever
 * e enviar reaproveita handleSubmit como se o usuário tivesse digitado a resposta.
 */
function ClarifyCard({
  clarification,
  disabled,
  onPick
}: {
  clarification: Clarification;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  const [freeText, setFreeText] = useState("");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="grid gap-2">
        {clarification.options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.label)}
            className="rounded-lg border border-[var(--border)] px-3.5 py-2.5 text-left text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:pointer-events-none disabled:opacity-50"
          >
            {option.label}
            {option.description && (
              <span className="mt-0.5 block text-xs font-normal text-[var(--muted-foreground)]">{option.description}</span>
            )}
          </button>
        ))}
      </div>
      {clarification.allowFreeText && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = freeText.trim();
            if (trimmed) onPick(trimmed);
          }}
          className="flex items-center gap-2 border-t border-[var(--border)] pt-2.5"
        >
          <Input
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            placeholder="Ou escreva sua resposta…"
            disabled={disabled}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={disabled || !freeText.trim()}>
            Enviar
          </Button>
        </form>
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";

  const textBubble = (
    <div
      className={cn(
        "rounded-lg p-4 text-sm leading-6 shadow-[var(--shadow-sm)]",
        isUser
          ? "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]"
          : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
      )}
    >
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
      {!isUser && <SourceLinks sources={message.sources} />}
    </div>
  );

  if (isUser) {
    return (
      <div className="flex animate-fade-in justify-end">
        <div className="max-w-[88%]">{textBubble}</div>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-in items-start justify-start gap-2.5">
      <BotAvatar />
      <div className="flex min-w-0 max-w-[88%] flex-1 flex-col gap-2">
        {textBubble}
        <ResultCard questionSetId={message.questionSetId} studyMaterialId={message.studyMaterialId} />
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
