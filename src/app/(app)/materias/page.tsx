import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function SubjectsPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const subjects = await prisma.subject.findMany({
    include: { _count: { select: { topics: true, questions: true } } },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Matérias</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => (
          <Link key={subject.id} href={`/materias/${subject.slug}`}>
            <Card className="h-full transition hover:border-[var(--primary)]">
              <CardHeader>
                <CardTitle>{subject.name}</CardTitle>
                <CardDescription>{subject.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-[var(--muted-foreground)]">
                {subject._count.topics} assuntos / {subject._count.questions} questões
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
