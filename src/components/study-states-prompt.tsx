"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MapPin, X } from "lucide-react";
import { setPreferredStatesQuickAction } from "@/app/(app)/perfil/actions";

const DISMISS_KEY = "study-states-prompt-dismissed";

/** Banner leve no chat pedindo os estados de interesse; some quando o usuário escolhe ou dispensa. */
export function StudyStatesPrompt() {
  const [show, setShow] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setShow(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  if (!show) return null;

  function chooseMa() {
    startTransition(async () => {
      await setPreferredStatesQuickAction(["MA"]);
      setShow(false);
    });
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-[var(--muted-foreground)]">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--primary)]" />
        <span>Em quais estados você pretende prestar concursos? A IA alinha as respostas à sua região.</span>
        <button
          type="button"
          onClick={chooseMa}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Concursos do MA
        </button>
        <Link href="/perfil#preferencias" className="font-semibold text-[var(--primary)] hover:underline">
          Escolher estados →
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
