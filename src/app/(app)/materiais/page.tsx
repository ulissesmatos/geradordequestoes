import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBR } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

const PAGE_SIZE = 24;

export default async function MaterialsPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [materials, total] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: { userId: user.id },
      include: { subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.studyMaterial.count({ where: { userId: user.id } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Materiais</h1>
          <p className="text-[var(--muted-foreground)]">Apostilas, resumos e guias gerados pela IA para sua rotina de estudo.</p>
        </div>
        <Button asChild>
          <Link href="/ai">
            <Sparkles className="h-4 w-4" />
            Gerar material no Chat IA
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {materials.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-[var(--muted-foreground)]">
              Nenhum material ainda. Peça ao chat algo como “gerar material de estudo sobre crase baseado nos meus erros”.
            </CardContent>
          </Card>
        )}
        {materials.map((material) => (
          <Link key={material.id} href={`/materiais/${material.id}`}>
            <Card className="h-full transition hover:border-[var(--primary)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-[var(--primary)]" />
                  {material.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--muted-foreground)]">
                <p>{material.subject?.name ?? "Sem matéria"} {material.topic ? `/ ${material.topic.name}` : ""}</p>
                <p className="mt-2">{formatDateBR(material.createdAt)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/materiais?page=${page - 1}`}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
          )}
          <span className="text-sm text-[var(--muted-foreground)]">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/materiais?page=${page + 1}`}>
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
