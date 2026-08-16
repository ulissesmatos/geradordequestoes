import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const TABS: AdminTabDef[] = [
  { value: "acoes", label: "Ações administrativas" },
  { value: "erros", label: "Erros do navegador" }
];

export default async function AdminAuditPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const activeTab = params.tab === "erros" ? "erros" : "acoes";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Auditoria" description="Registro de ações administrativas sensíveis e erros de JavaScript capturados no navegador." />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/auditoria" />

      {activeTab === "acoes" && <AcoesTab page={page} />}
      {activeTab === "erros" && <ErrosTab />}
    </div>
  );
}

async function AcoesTab({ page }: { page: number }) {
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
                {log.adminEmail} · {formatDateTimeBR(log.createdAt)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AdminPagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/auditoria?tab=acoes&page=${p}`} />
    </div>
  );
}

async function ErrosTab() {
  const errors = await prisma.clientErrorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div className="space-y-3">
      {errors.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhum erro reportado até agora.</p>
      )}
      {errors.map((err) => (
        <Card key={err.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span className="font-semibold text-[var(--destructive)]">{err.message}</span>
              <span className="text-[var(--muted-foreground)]">{formatDateTimeBR(err.createdAt)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-[var(--muted-foreground)]">
              URL: <code className="break-all">{err.url}</code>
            </p>
            <p className="text-[var(--muted-foreground)]">
              Navegador: <code className="break-all">{err.userAgent}</code>
            </p>
            {err.userId && (
              <p className="text-[var(--muted-foreground)]">
                Usuário: <code>{err.userId}</code>
              </p>
            )}
            {err.stack && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-[var(--muted-foreground)]">Stack trace</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-[var(--foreground)]">{err.stack}</pre>
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
