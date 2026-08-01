"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Link2, Loader2, Share2 } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";

export type ShareActionResult = { ok: true; url: string } | { ok: false; error: string };
export type RevokeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Modal genérico de "compartilhar link", reaproveitado tanto por chat quanto por bloco de
 * questões — as duas features têm exatamente a mesma UI (gerar/copiar/revogar link), só
 * mudando o texto e a action por trás.
 *
 * Abrir o modal já dispara a criação/reativação do link (não existe um passo extra de
 * "gerar"): é o mesmo comportamento de Notion/Google Docs — clicar em "Compartilhar" e já
 * ver o link pronto para copiar.
 */
export function ShareLinkModal({
  triggerLabel = "Compartilhar",
  /** Substitui o conteúdo padrão do botão-gatilho (ex.: só o ícone, para caber numa linha
   *  compacta da sidebar). O clique continua abrindo o modal do mesmo jeito. */
  trigger,
  triggerClassName,
  title,
  description,
  revokedNotice,
  initialShareUrl,
  createAction,
  revokeAction
}: {
  triggerLabel?: string;
  trigger?: ReactNode;
  triggerClassName?: string;
  title: string;
  description: string;
  /** Texto mostrado depois de revogar, antes de reabrir (explica o que "revogar" fez). */
  revokedNotice: string;
  /** Link já ativo, se o servidor já sabe que existe (evita o loading no primeiro open). */
  initialShareUrl?: string | null;
  createAction: () => Promise<ShareActionResult>;
  revokeAction: () => Promise<RevokeActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(initialShareUrl ?? null);
  const [justRevoked, setJustRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    setJustRevoked(false);
    setError(null);
    // Sempre (re)gera ao abrir: se já existe um link ativo, a action é idempotente e devolve
    // o mesmo; se estava revogado, reativa. O usuário nunca precisa de um botão "gerar" à parte.
    startTransition(async () => {
      const result = await createAction();
      if (result.ok) setShareUrl(result.url);
      else setError(result.error);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeAction();
      if (result.ok) {
        setShareUrl(null);
        setJustRevoked(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={triggerLabel}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-subtle)]"
        }
      >
        {trigger ?? (
          <>
            <Share2 className="h-4 w-4" />
            {triggerLabel}
          </>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel>
          <DialogHeader title={title} description={description} onClose={() => setOpen(false)} />

          <div className="space-y-4 px-6 py-5">
            {error && (
              <p className="flex items-start gap-2 rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            {pending && !shareUrl && (
              <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparando o link…
              </p>
            )}

            {shareUrl && (
              <>
                <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2">
                  <Link2 className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{shareUrl}</span>
                  <CopyButton value={shareUrl} />
                </div>
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={pending}
                  className="text-sm font-medium text-[var(--danger-soft-foreground)] underline decoration-dotted hover:no-underline disabled:opacity-60"
                >
                  Revogar link
                </button>
              </>
            )}

            {justRevoked && !shareUrl && (
              <p className="text-sm text-[var(--muted-foreground)]">{revokedNotice}</p>
            )}
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}
