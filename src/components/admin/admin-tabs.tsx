import Link from "next/link";
import { cn } from "@/lib/utils";

export type AdminTabDef = { value: string; label: string; count?: number };

/**
 * Abas por querystring (?tab=valor) — mesmo padrão já usado em src/app/(app)/biblioteca/page.tsx,
 * extraído aqui pra reuso nas páginas do admin. Só <Link>, sem JS client: a troca de aba é uma
 * navegação normal, o Server Component da página re-renderiza com o searchParams novo.
 *
 * Trocar de aba SEMPRE reseta outros parâmetros (página, filtros) — evita um filtro/página de
 * uma aba vazar pra outra, onde normalmente não faz sentido.
 */
export function AdminTabs({ tabs, activeValue, basePath }: { tabs: AdminTabDef[]; activeValue: string; basePath: string }) {
  return (
    <div className="scrollbar-ghost flex gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeValue === tab.value;
        return (
          <Link
            key={tab.value}
            href={`${basePath}?tab=${tab.value}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
            )}
          >
            {tab.label}
            {tab.count != null && <span className="ml-1.5 opacity-70">({tab.count})</span>}
          </Link>
        );
      })}
    </div>
  );
}
