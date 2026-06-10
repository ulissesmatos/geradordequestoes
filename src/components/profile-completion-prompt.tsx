"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IdCard, X } from "lucide-react";

const DISMISS_KEY = "profile-completion-dismissed";

export function ProfileCompletionPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(sessionStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <IdCard className="h-4 w-4 shrink-0 text-[var(--primary)]" />
        <span>
          Complete seu cadastro (CPF e dados pessoais) para agilizar pagamentos via Pix.{" "}
          <Link href="/perfil" className="font-semibold text-[var(--primary)] hover:underline">
            Completar agora →
          </Link>
        </span>
      </div>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
        className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
