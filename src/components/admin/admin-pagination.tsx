import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Janela de páginas com reticências (ex.: "1 … 4 5 6 … 12") — sempre mostra a primeira, a
 * última, e 1 pra cada lado da atual. As duas reticências usam chaves diferentes ("start"/"end")
 * pra nunca colidir como key do React, mesmo quando as duas aparecem juntas.
 */
function buildPageRange(current: number, total: number): (number | "start-ellipsis" | "end-ellipsis")[] {
  const delta = 1;
  const middle: number[] = [];
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
    middle.push(i);
  }

  const result: (number | "start-ellipsis" | "end-ellipsis")[] = [];
  if (middle[0] > 1) {
    result.push(1);
    if (middle[0] > 2) result.push("start-ellipsis");
  }
  result.push(...middle);
  if (middle[middle.length - 1] < total) {
    if (middle[middle.length - 1] < total - 1) result.push("end-ellipsis");
    result.push(total);
  }
  return result;
}

function PageLink({ href, active, disabled, children }: { href: string; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "min-w-9 rounded-md border px-2.5 py-1.5 text-center text-sm font-medium",
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      {children}
    </a>
  );
}

/** Paginação numerada (1, 2, 3…) — substitui os pares soltos de link "Anterior"/"Próxima". */
export function AdminPagination({
  page,
  totalPages,
  buildHref
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const items = buildPageRange(page, totalPages);

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Paginação">
      <PageLink href={buildHref(Math.max(1, page - 1))} disabled={page <= 1}>
        ‹ Anterior
      </PageLink>
      {items.map((item) =>
        typeof item === "number" ? (
          <PageLink key={item} href={buildHref(item)} active={item === page}>
            {item}
          </PageLink>
        ) : (
          <span key={item} className="px-1.5 text-sm text-[var(--muted-foreground)]">
            …
          </span>
        )
      )}
      <PageLink href={buildHref(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
        Próxima ›
      </PageLink>
    </nav>
  );
}
