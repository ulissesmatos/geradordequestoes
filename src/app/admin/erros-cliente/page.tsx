import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export default async function ClientErrorsPage() {
  await requireAdmin();

  const errors = await prisma.clientErrorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Erros do navegador"
        description="Erros de JavaScript capturados no navegador de quem usa o site (logado ou não) — coisas que nunca aparecem nos logs de servidor porque nunca chegam a virar uma falha no back-end."
      />

      {errors.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhum erro reportado até agora.</p>
      )}

      <div className="space-y-3">
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
    </div>
  );
}
