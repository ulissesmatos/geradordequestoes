import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card no estilo SaasAble — substitui `Card` nas telas privadas restylizadas.
 *  bg-theme-bg-paper (não bg-white) para responder ao modo escuro. */
export function Panel({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={cn("rounded-2xl sm:rounded-3xl bg-theme-bg-paper p-5 sm:p-6 space-y-4", className)}>
      {children}
    </div>
  );
}

/** Título + descrição de uma Panel, com ícone Tabler. */
export function PanelHeader({ icon, title, description }: { icon: string; title: string; description?: ReactNode }) {
  return (
    <div>
      <h4 className="h4 flex items-center gap-2">
        <i className={cn("ti text-xl leading-none text-primary-500", icon)} />
        {title}
      </h4>
      {description && <p className="mt-1 body2 text-theme-text-secondary">{description}</p>}
    </div>
  );
}
