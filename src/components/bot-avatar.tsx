import { Bot, Check } from "lucide-react";

/**
 * Identidade visual do assistente de IA — avatar teal com selo de check em âmbar.
 * Compartilhado entre o chat real (ai-chat-dashboard.tsx) e a seção "Chat IA" da
 * landing page, para as duas superfícies não ficarem visualmente dessincronizadas.
 */
export function BotAvatar() {
  return (
    <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] shadow-[var(--shadow-sm)]">
      <Bot className="h-3.5 w-3.5 text-white" />
      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--accent)]">
        <Check className="h-2 w-2 text-white" strokeWidth={3} />
      </span>
    </div>
  );
}
