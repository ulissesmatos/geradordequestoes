import Link from "next/link";
import { BookOpen, Clock, Heart, Layers3, Play, RotateCcw, Sparkles } from "lucide-react";
import { QuestionSetMode } from "@prisma/client";
import { QuestionRunner } from "@/components/question-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { questionFormatLabel, questionSetModeLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

const tabs = [
  { value: "todos", label: "Todos" },
  { value: "questoes", label: "Questões" },
  { value: "simulados", label: "Simulados" },
  { value: "revisoes", label: "Revisões" },
  { value: "andamento", label: "Em andamento" },
  { value: "respondidos", label: "Respondidos" },
  { value: "favoritos", label: "Favoritos" }
];

export default async function LibraryPage({
  searchParams
}: {
  searchParams: Promise<{ setId?: string; tab?: string }>;
}) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const filters = await searchParams;
  const activeTab = filters.tab ?? "todos";

  const [questionSets, favorites] = await Promise.all([
    prisma.questionSet.findMany({
      where: { userId: user.id },
      include: {
        subject: true,
        topic: true,
        questions: {
          include: {
            attempts: { where: { userId: user.id } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.favoriteQuestion.findMany({
      where: { userId: user.id },
      include: { question: { include: { subject: true, topic: true } } },
      orderBy: { createdAt: "desc" },
      take: 24
    })
  ]);

  const selectedSet = filters.setId
    ? await prisma.questionSet.findFirst({
        where: { id: filters.setId, userId: user.id },
        include: {
          questions: {
            include: {
              subject: true,
              topic: true,
              options: { orderBy: { order: "asc" } }
            },
            orderBy: { orderInSet: "asc" }
          }
        }
      })
    : null;

  if (selectedSet) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/biblioteca">Voltar para biblioteca</Link>
        </Button>
        <QuestionRunner questions={selectedSet.questions} mode={selectedSet.mode === QuestionSetMode.SIMULADO ? "simulado" : "study"} />
      </div>
    );
  }

  const filteredSets = filterSets(questionSets, activeTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Biblioteca</h1>
          <p className="text-[var(--muted-foreground)]">Tudo que a IA gerou para você: questões, simulados, revisões e favoritos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/questoes/gerar">
              <Sparkles className="h-4 w-4" />
              Geração rápida
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <Play className="h-4 w-4" />
              Gerar no Chat IA
            </Link>
          </Button>
        </div>
      </div>

      <div className="scrollbar-ghost flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/biblioteca?tab=${tab.value}`}
            className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${
              activeTab === tab.value
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {activeTab === "favoritos" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Favoritos
              </CardTitle>
              {favorites.length > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard?new=1&prompt=${encodeURIComponent("Crie uma revisão com minhas questões favoritas")}`}>
                    <RotateCcw className="h-4 w-4" />
                    Criar revisão com favoritas
                  </Link>
                </Button>
              )}
            </div>
            <CardDescription>Questões marcadas para revisão rápida.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {favorites.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhuma favorita ainda.</p>}
            {favorites.map((favorite) => (
              <div key={favorite.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="line-clamp-3 text-sm">{favorite.question.statement}</p>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">{favorite.question.subject.name} / {favorite.question.topic.name}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers3 className="h-5 w-5" />
              Blocos salvos
            </CardTitle>
            <CardDescription>Abra um bloco para responder agora ou continuar depois.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {filteredSets.length === 0 && (
              <div className="md:col-span-2 flex flex-col items-start gap-3 rounded-md border border-dashed border-[var(--border)] p-6">
                <p className="text-sm text-[var(--muted-foreground)]">Nada por aqui ainda. Peça questões, um simulado ou uma revisão no chat e o bloco aparece aqui.</p>
                <Button asChild size="sm">
                  <Link href="/dashboard">
                    <Play className="h-4 w-4" />
                    Gerar primeiro bloco no Chat IA
                  </Link>
                </Button>
              </div>
            )}
            {filteredSets.map((set) => {
              const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId))).size;
              const icon = set.mode === "SIMULADO" ? <Clock className="h-4 w-4" /> : set.mode === "REVISAO" ? <RotateCcw className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />;
              return (
                <Link key={set.id} href={`/biblioteca?setId=${set.id}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--primary)]">
                  <p className="flex items-center gap-2 font-semibold">{icon}{set.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{set.subject.name} / {set.topic.name}</p>
                  <p className="mt-3 text-sm">{answered} de {set.quantity} respondidas</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{questionSetModeLabel(set.mode)} · {questionFormatLabel(set.format)}</p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function filterSets<
  T extends {
    mode: QuestionSetMode;
    questions: Array<{ id: string; attempts: Array<{ questionId: string }> }>;
  }
>(sets: T[], tab: string) {
  return sets.filter((set) => {
    const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId))).size;
    if (tab === "questoes") return set.mode === QuestionSetMode.ESTUDO;
    if (tab === "simulados") return set.mode === QuestionSetMode.SIMULADO;
    if (tab === "revisoes") return set.mode === QuestionSetMode.REVISAO;
    if (tab === "andamento") return answered > 0 && answered < set.questions.length;
    if (tab === "respondidos") return set.questions.length > 0 && answered >= set.questions.length;
    return true;
  });
}
