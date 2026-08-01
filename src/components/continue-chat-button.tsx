"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { cloneSharedChatAction } from "@/app/(app)/actions/chat-actions";

/** "Continuar esta conversa" — clona para uma sessão nova e leva o usuário para ela em /ai. */
export function ContinueChatButton({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await cloneSharedChatAction(shareId);
      if (result.ok) router.push(`/ai?sessionId=${result.sessionId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Continuar esta conversa
      </button>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--danger-soft-foreground)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
