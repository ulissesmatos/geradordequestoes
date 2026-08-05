import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Prisma, QuestionSetShareVisibility, Role } from "@prisma/client";
import {
  adminReactivateQuestionSetShareAction,
  adminRevokeQuestionSetShareAction
} from "@/app/admin/admin-actions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminShareVisibilitySelect } from "@/components/admin/share-visibility-select";
import { CopyButton } from "@/components/admin/copy-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { questionSetShareUrl } from "@/lib/question-set-share";

const PAGE_SIZE = 30;

const statusFilters = [
  { key: "active", label: "Ativos" },
  { key: "revoked", label: "Revogados" },
  { key: "all", label: "Todos" }
] as const;

export default async function AdminQuestionSetSharesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageRaw } = await searchParams;
  const query = (q ?? "").trim();
  const activeStatus = statusFilters.some((f) => f.key === status) ? (status as (typeof statusFilters)[number]["key"]) : "active";
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);

  const statusWhere: Prisma.QuestionSetShareWhereInput =
    activeStatus === "active" ? { revokedAt: null } : activeStatus === "revoked" ? { revokedAt: { not: null } } : {};
  const searchWhere: Prisma.QuestionSetShareWhereInput = query
    ? {
        OR: [
          { questionSet: { title: { contains: query, mode: "insensitive" } } },
          { user: { name: { contains: query, mode: "insensitive" } } },
          { user: { email: { contains: query, mode: "insensitive" } } }
        ]
      }
    : {};
  const where: Prisma.QuestionSetShareWhereInput = { ...statusWhere, ...searchWhere };

  const [shares, total, activeCount] = await Promise.all([
    prisma.questionSetShare.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, role: true } },
        questionSet: {
          select: { title: true, quantity: true, subject: { select: { name: true } }, topic: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.questionSetShare.count({ where }),
    prisma.questionSetShare.count({ where: { revokedAt: null } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Compartilhamentos"
        description={`${activeCount} links de bloco de questões ativos no momento`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <Link
              key={f.key}
              href={`/admin/compartilhamentos?status=${f.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                activeStatus === f.key
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="status" value={activeStatus} />
          <Input name="q" defaultValue={query} placeholder="Buscar por bloco, nome ou e-mail..." className="max-w-sm" />
          <SubmitButton variant="outline">Buscar</SubmitButton>
        </form>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-left">
              <th className="px-4 py-3 font-semibold">Bloco</th>
              <th className="px-4 py-3 font-semibold">Criado por</th>
              <th className="px-4 py-3 font-semibold">Visibilidade</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Criado em</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shares.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                  Nenhum link encontrado.
                </td>
              </tr>
            )}
            {shares.map((share) => {
              const revoked = Boolean(share.revokedAt);
              return (
                <tr key={share.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-subtle)]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{share.questionSet.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {share.questionSet.subject.name} · {share.questionSet.topic.name} · {share.questionSet.quantity}{" "}
                      {share.questionSet.quantity === 1 ? "questão" : "questões"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{share.user.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                      {share.user.email}
                      {share.user.role === Role.ADMIN && <StatusBadge tone="info">Admin</StatusBadge>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <AdminShareVisibilitySelect
                      shareId={share.id}
                      initialVisibility={share.visibility ?? QuestionSetShareVisibility.LOGGED_IN}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={revoked ? "danger" : "success"}>{revoked ? "Revogado" : "Ativo"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDateTimeBR(share.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CopyButton value={questionSetShareUrl(share.id)} label="Copiar link" />
                      <a
                        href={questionSetShareUrl(share.id)}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir link público"
                        className="inline-flex items-center rounded-md border border-[var(--border)] p-1.5 transition hover:bg-[var(--surface-subtle)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {revoked ? (
                        <form action={adminReactivateQuestionSetShareAction}>
                          <input type="hidden" name="id" value={share.id} />
                          <SubmitButton variant="outline" size="sm">
                            Reativar
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={adminRevokeQuestionSetShareAction}>
                          <input type="hidden" name="id" value={share.id} />
                          <SubmitButton variant="outline" size="sm">
                            Revogar
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/compartilhamentos?status=${activeStatus}${query ? `&q=${encodeURIComponent(query)}` : ""}&page=${p}`}
      />
    </div>
  );
}
