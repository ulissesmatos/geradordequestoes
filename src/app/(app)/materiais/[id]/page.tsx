import Link from "next/link";
import { Download, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">{material.subject?.name ?? "Material"} {material.topic ? `/ ${material.topic.name}` : ""}</p>
          <h1 className="text-3xl font-bold">{material.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/materiais/${material.id}/pdf`}>
              <Download className="h-4 w-4" />
              Baixar PDF
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/ai?new=1`}>
              <Sparkles className="h-4 w-4" />
              Gerar questões
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <MarkdownContent content={material.content} />
        </CardContent>
      </Card>
    </div>
  );
}
