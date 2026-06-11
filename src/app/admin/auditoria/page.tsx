import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.adminAuditLog.count()
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Auditoria" description="Registro de ações administrativas sensíveis." />

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>{total} registros · página {page} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum evento registrado ainda.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-semibold">{log.action}</span>
                <span className="font-medium">{log.entity}</span>
                {log.summary && <span className="text-[var(--muted-foreground)]">· {log.summary}</span>}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {log.adminEmail} · {log.createdAt.toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <a
          aria-disabled={page <= 1}
          href={`/admin/auditoria?page=${page - 1}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Anterior
        </a>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/auditoria?page=${page + 1}`}
          className={`rounded-md border border-[var(--border)] px-3 py-2 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[var(--surface-subtle)]"}`}
        >
          Próxima
        </a>
      </div>
    </div>
  );
}
