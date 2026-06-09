import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function SubjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { slug } = await params;
  const subject = await prisma.subject.findUnique({
    where: { slug },
    include: { topics: { orderBy: { name: "asc" }, include: { _count: { select: { questions: true } } } } }
  });
  if (!subject) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{subject.name}</h1>
        <p className="text-[var(--muted-foreground)]">{subject.description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {subject.topics.map((topic) => (
          <Card key={topic.id}>
            <CardHeader><CardTitle>{topic.name}</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--muted-foreground)]">{topic._count.questions} questões cadastradas</span>
              <Button asChild size="sm">
                <Link href={`/questoes/estudar?subjectId=${subject.id}&topicId=${topic.id}`}>Estudar</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
