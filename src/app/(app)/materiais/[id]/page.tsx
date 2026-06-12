import Link from "next/link";
import { ArrowLeft, BookOpen, Download, Sparkles, Tag } from "lucide-react";
import { DeleteMaterialButton } from "@/components/delete-material-button";
import { MaterialEditor } from "@/components/material-editor";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { id } = await params;
  const material = await prisma.studyMaterial.findFirst({
    where: { id, userId: user.id },
    include: { subject: true, topic: true }
  });
  if (!material) {
    return <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">Material não encontrado.</p>;
  }

  const createdAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(material.createdAt);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link
          href="/materiais"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Materiais
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {material.subject && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-soft-foreground)]">
              <BookOpen className="h-3.5 w-3.5" />
              {material.subject.name}
            </span>
          )}
          {material.topic && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
              <Tag className="h-3.5 w-3.5" />
              {material.topic.name}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">{material.title}</h1>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            Gerado por IA em {createdAt}
          </p>
          <div className="flex gap-2">
            <DeleteMaterialButton materialId={material.id} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/materiais/${material.id}/pdf`}>
                <Download className="h-4 w-4" />
                Baixar PDF
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/ai?new=1&prompt=${encodeURIComponent(`Gere questões sobre o material "${material.title}"`)}`}>
                <Sparkles className="h-4 w-4" />
                Gerar questões
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <MaterialEditor materialId={material.id} initialContent={material.content} />
    </div>
  );
}
