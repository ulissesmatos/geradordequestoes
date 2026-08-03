import { Megaphone, Sparkles, X } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import type { PopupPayload } from "@/lib/popups";
import { cn } from "@/lib/utils";

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function CloseButton({ onDismiss, className }: { onDismiss?: () => void; className: string }) {
  if (!onDismiss) return null;
  return (
    <button type="button" onClick={onDismiss} aria-label="Fechar" className={className}>
      <X className="h-4 w-4" />
    </button>
  );
}

/**
 * Conteúdo visual puro do popup (sem hooks) — usado tanto pelo PopupManager (client, popup
 * real em Dialog) quanto pelo preview estático em /admin/popups (server, sem Dialog). Quem
 * envolve este componente é responsável por `overflow-hidden` + cantos arredondados, pra a
 * imagem/banner não vazar do card.
 */
export function PopupModalContent({
  popup,
  onDismiss,
  onCtaClick
}: {
  popup: PopupPayload;
  /** Ausente no preview estático do admin — o botão de fechar/dispensar fica desabilitado. */
  onDismiss?: () => void;
  onCtaClick?: () => void;
}) {
  const hasCta = Boolean(popup.ctaLabel && popup.ctaUrl);
  const isUpgrade = popup.kind === "UPGRADE";

  return (
    <div>
      {popup.imageUrl && <img src={popup.imageUrl} alt="" className="h-40 w-full object-cover" />}

      {isUpgrade ? (
        <div className="relative bg-gradient-to-br from-[var(--primary)] to-[#14a89a] px-6 py-6 text-white">
          <CloseButton
            onDismiss={onDismiss}
            className="absolute right-4 top-4 rounded-md p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          />
          <Sparkles className="h-6 w-6 text-white/90" />
          {popup.eyebrow && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/80">{popup.eyebrow}</p>}
          <h2 className="mt-1 text-xl font-bold leading-snug">{popup.title}</h2>
        </div>
      ) : (
        <div className="relative px-6 pt-6">
          <CloseButton
            onDismiss={onDismiss}
            className="absolute right-4 top-4 rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)]">
            <Megaphone className="h-5 w-5 text-[var(--accent-foreground)]" />
          </div>
          {popup.eyebrow && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{popup.eyebrow}</p>
          )}
          <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">{popup.title}</h2>
        </div>
      )}

      <div className="max-h-[50vh] overflow-y-auto px-6 py-4 text-sm text-[var(--foreground)]">
        <MarkdownContent content={popup.body} compact />
      </div>

      <div className="flex flex-col gap-2 px-6 pb-6 pt-1">
        {hasCta && (
          <Button asChild variant={isUpgrade ? "default" : "outline"} className="w-full" onClick={onCtaClick}>
            <a
              href={popup.ctaUrl ?? undefined}
              target={isExternalUrl(popup.ctaUrl!) ? "_blank" : undefined}
              rel={isExternalUrl(popup.ctaUrl!) ? "noopener noreferrer" : undefined}
            >
              {popup.ctaLabel}
            </a>
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          disabled={!onDismiss}
          className={cn(
            "text-center font-medium text-[var(--muted-foreground)] underline-offset-2 hover:underline disabled:cursor-default disabled:no-underline",
            hasCta ? "text-xs" : "text-sm"
          )}
        >
          {popup.dismissLabel}
        </button>
      </div>
    </div>
  );
}
