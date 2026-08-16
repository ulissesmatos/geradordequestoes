"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Link2, Loader2, Share2 } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from "@/components/icons/social-icons";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { canUseNativeShare } from "@/lib/device";

export type ShareActionResult = { ok: true; url: string } | { ok: false; error: string };
export type RevokeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Modal genérico de "compartilhar link", reaproveitado tanto por chat quanto por bloco de
 * questões — as duas features têm exatamente a mesma UI (gerar/copiar/revogar link), só
 * mudando o texto e a action por trás.
 *
 * Em celular (Android/iOS), clicar já dispara o share sheet nativo do SO direto — nosso modal
 * nunca chega a aparecer. Em desktop (ou se o share nativo falhar/não existir), abre este modal
 * com o link e um painel de redes sociais (X, WhatsApp, Facebook, Instagram, copiar link).
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
  /** Título do conteúdo em si (ex.: título da conversa/bloco), usado no share nativo do SO.
   *  Cai para `title` (rótulo da ação) quando omitido. */
  shareTitle,
  revokedNotice,
  initialShareUrl,
  createAction,
  revokeAction,
  open: openProp,
  onOpenChange,
  children
}: {
  triggerLabel?: string;
  trigger?: ReactNode;
  triggerClassName?: string;
  title: string;
  description: string;
  shareTitle?: string;
  /** Texto mostrado depois de revogar, antes de reabrir (explica o que "revogar" fez). */
  revokedNotice: string;
  /** Link já ativo, se o servidor já sabe que existe (evita o loading no primeiro open). */
  initialShareUrl?: string | null;
  createAction: () => Promise<ShareActionResult>;
  revokeAction: () => Promise<RevokeActionResult>;
  /**
   * Controlado por fora junto com `onOpenChange`: não renderiza o próprio botão-gatilho — o
   * chamador decide o que abre o modal (ex.: um item de um dropdown que precisa sobreviver ao
   * dropdown fechando). Sem os dois, o componente é não controlado e desenha seu próprio botão.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Controles extras (ex.: seletor de visibilidade de admin), só aparecem com o link ativo. */
  children?: ReactNode;
}) {
  const controlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  // Separado de `open`: em celular, `open` pode virar true e voltar false só pra disparar o
  // share nativo, sem o modal chegar a aparecer na tela (sem esse estado à parte, o Dialog
  // piscaria aberto por um instante antes do share sheet do SO tomar conta).
  const [dialogVisible, setDialogVisible] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(initialShareUrl ?? null);
  const [justRevoked, setJustRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedVia, setCopiedVia] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setOpen(value: boolean) {
    setUncontrolledOpen(value);
    onOpenChange?.(value);
  }

  useEffect(() => {
    if (!open) {
      setDialogVisible(false);
      return;
    }
    setJustRevoked(false);
    setError(null);
    setCopiedVia(null);
    // Sempre (re)gera ao abrir: se já existe um link ativo, a action é idempotente e devolve
    // o mesmo; se estava revogado, reativa. O usuário nunca precisa de um botão "gerar" à parte.
    startTransition(async () => {
      const result = await createAction();
      if (!result.ok) {
        setError(result.error);
        setDialogVisible(true);
        return;
      }
      setShareUrl(result.url);

      if (canUseNativeShare()) {
        try {
          await navigator.share({ title: shareTitle ?? title, url: result.url });
          setOpen(false);
          return;
        } catch (err) {
          // Usuário cancelou o share sheet nativo — não é erro, só fecha sem abrir nosso modal.
          if ((err as Error)?.name === "AbortError") {
            setOpen(false);
            return;
          }
          // Falha de verdade do Web Share API: cai para o modal como alternativa.
        }
      }
      setDialogVisible(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeDialog() {
    setDialogVisible(false);
    setOpen(false);
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

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedVia("link");
      setTimeout(() => setCopiedVia((v) => (v === "link" ? null : v)), 2000);
    } catch {
      // clipboard indisponível
    }
  }

  async function shareToInstagram() {
    if (!shareUrl) return;
    // Instagram não tem intent web pra compartilhar um link igual X/WhatsApp/Facebook — a prática
    // comum é copiar o link e deixar o usuário colar numa conversa/story dentro do app/site deles.
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedVia("instagram");
      setTimeout(() => setCopiedVia((v) => (v === "instagram" ? null : v)), 3000);
    } catch {
      // clipboard indisponível
    }
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  const contentTitle = shareTitle ?? title;
  const encodedUrl = shareUrl ? encodeURIComponent(shareUrl) : "";
  const encodedText = encodeURIComponent(contentTitle);

  return (
    <>
      {!controlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
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
      )}

      <Dialog open={dialogVisible} onClose={closeDialog}>
        <DialogPanel>
          <DialogHeader title={title} description={description} onClose={closeDialog} />

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

                <div>
                  <div className="grid grid-cols-5 gap-2">
                    <ShareTile
                      as="a"
                      href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
                      label="X"
                      bgClassName="bg-black"
                      iconClassName="text-white"
                    >
                      <XIcon className="h-5 w-5" />
                    </ShareTile>
                    <ShareTile
                      as="a"
                      href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
                      label="WhatsApp"
                      bgClassName="bg-[#25D366]"
                      iconClassName="text-white"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                    </ShareTile>
                    <ShareTile
                      as="a"
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                      label="Facebook"
                      bgClassName="bg-[#1877F2]"
                      iconClassName="text-white"
                    >
                      <FacebookIcon className="h-5 w-5" />
                    </ShareTile>
                    <ShareTile
                      as="button"
                      onClick={shareToInstagram}
                      label="Instagram"
                      bgClassName="bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]"
                      iconClassName="text-white"
                    >
                      <InstagramIcon className="h-5 w-5" />
                    </ShareTile>
                    <ShareTile
                      as="button"
                      onClick={copyLink}
                      label={copiedVia === "link" ? "Copiado!" : "Link"}
                      bgClassName="bg-[var(--surface-subtle)] border border-[var(--border)]"
                      iconClassName="text-[var(--foreground)]"
                    >
                      <Link2 className="h-5 w-5" />
                    </ShareTile>
                  </div>
                  {copiedVia === "instagram" && (
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      Instagram não permite colar o link direto — copiamos para você, é só colar numa conversa ou story.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={pending}
                  className="text-sm font-medium text-[var(--danger-soft-foreground)] underline decoration-dotted hover:no-underline disabled:opacity-60"
                >
                  Revogar link
                </button>
                {children}
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

function ShareTile(
  props: { label: string; bgClassName: string; iconClassName: string; children: ReactNode } & (
    | { as: "a"; href: string }
    | { as: "button"; onClick: () => void }
  )
) {
  const { label, bgClassName, iconClassName, children } = props;
  const inner = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${bgClassName} ${iconClassName}`}>
        {children}
      </span>
      <span className="text-[11px] text-[var(--muted-foreground)]">{label}</span>
    </>
  );
  const wrapperClass = "flex flex-col items-center gap-1";

  if (props.as === "a") {
    return (
      <a href={props.href} target="_blank" rel="noopener noreferrer" title={label} className={wrapperClass}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={props.onClick} title={label} className={wrapperClass}>
      {inner}
    </button>
  );
}
