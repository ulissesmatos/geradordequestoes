type Props = {
  title: string;
  description?: React.ReactNode;
  /** Ações à direita (botões, links). */
  actions?: React.ReactNode;
};

/** Cabeçalho padrão das páginas do admin: título + descrição + ações opcionais. */
export function AdminPageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-[var(--muted-foreground)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
