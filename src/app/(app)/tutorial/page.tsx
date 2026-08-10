import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

/**
 * Índice do tutorial — documentação guiada da plataforma.
 *
 * Só `requireUser()`, de propósito: é documentação grátis, não deve travar quem está no trial
 * nem quem está sem plano ativo, diferente da maioria das páginas de `(app)`.
 */
export default async function TutorialIndexPage() {
  await requireUser();

  const guides = await prisma.tutorialGuide.findMany({
    where: { isPublished: true },
    orderBy: { displayOrder: "asc" },
    include: { _count: { select: { steps: true } } }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tutorial</h1>
        <p className="text-[var(--muted-foreground)]">Guias curtos, com print de cada tela, para tirar dúvidas sobre como usar a plataforma.</p>
      </div>

      {guides.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum guia publicado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => (
            <Link key={guide.id} href={`/tutorial/${guide.slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-[var(--primary)]">
                <CardHeader className="pb-3">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                    <i className={`ti ${guide.icon} text-lg text-[var(--primary-soft-foreground)]`} aria-hidden />
                  </div>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    {guide.title}
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted-foreground)]">{guide.description}</p>
                  <p className="mt-3 text-xs font-medium text-[var(--muted-foreground)]">
                    {guide._count.steps} {guide._count.steps === 1 ? "passo" : "passos"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
