import { Building2, Mail } from "lucide-react";
import { toggleContactHandledAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function AdminContatoPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);

  const [messages, total, pendingCount] = await Promise.all([
    prisma.contactMessage.findMany({
      orderBy: [{ handledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { handledAt: null } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Contato"
        description={`${total} mensagens · ${pendingCount} pendentes`}
      />

      <div className="space-y-3">
        {messages.map((m) => {
          const handled = !!m.handledAt;
          return (
            <Card key={m.id} className={handled ? "opacity-70" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.subject}</span>
                      {m.kind === "TEAMS" ? (
                        <StatusBadge tone="info"><Building2 className="h-3 w-3" /> Empresas</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral"><Mail className="h-3 w-3" /> Geral</StatusBadge>
                      )}
                      {handled ? (
                        <StatusBadge tone="success">Tratado</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Pendente</StatusBadge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {m.name} · <a href={`mailto:${m.email}`} className="underline-offset-2 hover:underline">{m.email}</a>
                      {m.phone ? ` · ${m.phone}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatDate(m.createdAt)}</span>
                </div>

                <p className="whitespace-pre-wrap rounded-md bg-[var(--surface-subtle)] p-3 text-sm">{m.message}</p>

                <form action={toggleContactHandledAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="handled" value={handled ? "false" : "true"} />
                  <SubmitButton variant={handled ? "outline" : "default"} size="sm">
                    {handled ? "Reabrir" : "Marcar como tratado"}
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          );
        })}
        {messages.length === 0 && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhuma mensagem de contato ainda.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <a
          aria-disabled={page <= 1}
          href={`/admin/contato?page=${page - 1}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Anterior
        </a>
        <span className="text-sm text-[var(--muted-foreground)]">página {page} de {totalPages}</span>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/contato?page=${page + 1}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Próxima
        </a>
      </div>
    </div>
  );
}
