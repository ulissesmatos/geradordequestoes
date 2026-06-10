import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function MaterialsPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const materials = await prisma.studyMaterial.findMany({
    where: { userId: user.id },
    include: { subject: true, topic: true },
    orderBy: { createdAt: "desc" }
  });

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
                <p className="mt-2">{material.createdAt.toLocaleDateString("pt-BR")}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
