import Link from "next/link";
import { StudyMaterialStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function AdminAiMaterialsPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = Object.values(StudyMaterialStatus).includes(params?.status as StudyMaterialStatus)
    ? (params?.status as StudyMaterialStatus)
    : undefined;

  const [materials, total, ready, archived] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: status ? { status } : undefined,
      include: { user: true, subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.studyMaterial.count(),
    prisma.studyMaterial.count({ where: { status: StudyMaterialStatus.READY } }),
    prisma.studyMaterial.count({ where: { status: StudyMaterialStatus.ARCHIVED } })
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Materiais IA" description="Materiais de estudo privados gerados pelos alunos via chat." />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total" value={total} />
        <Metric title="Prontos" value={ready} />
        <Metric title="Arquivados" value={archived} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Controle rápido por status.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <FilterLink href="/admin/materiais-ia" active={!status}>Todos</FilterLink>
          {Object.values(StudyMaterialStatus).map((item) => (
            <FilterLink key={item} href={`/admin/materiais-ia?status=${item}`} active={status === item}>
              {item}
            </FilterLink>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {materials.map((material) => (
          <Card key={material.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{material.title}</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {material.user.email} / {material.subject?.name ?? "Sem matéria"} / {material.topic?.name ?? "Sem assunto"}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                  {material.status}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">{material.prompt}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link className="font-semibold text-[var(--primary)] hover:underline" href={`/materiais/${material.id}`}>
                  Abrir como aluno
                </Link>
                <Link className="font-semibold text-[var(--primary)] hover:underline" href={`/materiais/${material.id}/pdf`}>
                  Baixar PDF
                </Link>
                <span className="text-[var(--muted-foreground)]">{formatDate(material.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {materials.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum material encontrado</CardTitle>
              <CardDescription>Quando alunos gerarem materiais no chat, eles aparecerão aqui.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{value}</CardTitle>
        <CardDescription>{title}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      className={`rounded-md border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function formatDate(date: Date) {
  return formatDateTimeBR(date);
}
