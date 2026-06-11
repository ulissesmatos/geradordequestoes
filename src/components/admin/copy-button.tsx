"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Botão pequeno de copiar texto (links, códigos) com feedback visual. */
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold transition hover:bg-[var(--surface-subtle)]"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copiado!" : label}
    </button>
  );
}
