import type { ReactNode } from "react";
import { Reveal } from "@/components/saasable/reveal";

/** Cabeçalho de página simples (badge + título + subtítulo) no estilo da home. */
export function SaasablePageHeader({
  icon,
  badge,
  title,
  description
}: {
  icon?: ReactNode;
  badge: string;
  title: string;
  description?: string;
}) {
  return (
    <Reveal className="flex flex-col items-center gap-3 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-theme-divider bg-theme-bg-paper px-3 py-1.5 caption text-theme-text-secondary">
        {icon}
        {badge}
      </div>
      <h1 className="h1 max-w-2xl">{title}</h1>
      {description && <h6 className="h6 max-w-xl text-theme-text-secondary font-normal">{description}</h6>}
    </Reveal>
  );
}
