import Link from "next/link";
import { QuestionSetMode } from "@prisma/client";
import { ModeGenerateForm } from "@/components/mode-generate-form";
import { QuestionRunner } from "@/components/question-runner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function SimuladoPage({
  searchParams
}: {
  searchParams: Promise<{ setId?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const filters = await searchParams;

  const [subjects, simulados] = await Promise.all([
    prisma.subject.findMany({ include: { topics: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.questionSet.findMany({
      where: { userId: user.id, mode: QuestionSetMode.SIMULADO },
      include: { subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const selectedSet = filters.setId
    ? await prisma.questionSet.findFirst({
        where: { id: filters.setId, userId: user.id, mode: QuestionSetMode.SIMULADO },
        include: {
          questions: {
            include: { subject: true, topic: true, options: { orderBy: { order: "asc" } } },
            orderBy: { orderInSet: "asc" }
          }
        }
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Simulado</h1>
        <p className="text-[var(--muted-foreground)]">Gere simulados personalizados com IA e veja o resultado só ao finalizar.</p>
      </div>

      {selectedSet ? (
        <QuestionRunner questions={selectedSet.questions} mode="simulado" />
      ) : (
        <>
          <ModeGenerateForm
            subjects={subjects}
            mode="SIMULADO"
            title="Gerar simulado com IA"
            description="Monte um simulado novo por matéria, assunto, formato e dificuldade."
            promptPlaceholder="Ex.: gere um simulado com foco em informática para banca Cebraspe, com enunciados objetivos e sem temas desatualizados."
          />
          <Card>
            <CardHeader><CardTitle>Simulados salvos</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {simulados.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum simulado gerado ainda.</p>}
              {simulados.map((set) => (
                <Link key={set.id} href={`/questoes/simulado?setId=${set.id}`} className="rounded-md border border-[var(--border)] p-4 hover:border-[var(--primary)]">
                  <p className="font-semibold">{set.title}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{set.subject.name} / {set.topic.name}</p>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">{set.quantity} questões / {set.format}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
