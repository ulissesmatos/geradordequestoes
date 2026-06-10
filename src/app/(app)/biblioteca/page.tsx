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
import { cn } from "@/lib/utils";

function modeMeta(mode: QuestionSetMode) {
  if (mode === QuestionSetMode.SIMULADO) {
    return { label: questionSetModeLabel(mode), icon: Clock, className: "bg-[var(--accent-soft)] text-[var(--accent-foreground)]" };
  }
  if (mode === QuestionSetMode.REVISAO) {
    return { label: questionSetModeLabel(mode), icon: RotateCcw, className: "bg-[var(--info-soft)] text-[var(--info-soft-foreground)]" };
  }
  return { label: questionSetModeLabel(mode), icon: BookOpen, className: "bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]" };
}

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
            <Link href="/ai">
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
                  <Link href={`/ai?new=1&prompt=${encodeURIComponent("Crie uma revisão com minhas questões favoritas")}`}>
                    <RotateCcw className="h-4 w-4" />
                    Criar revisão com favoritas
                  </Link>
                </Button>
              )}
            </div>
            <CardDescription>Questões marcadas para revisão rápida.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhuma favorita ainda.</p>}
            {favorites.map((favorite) => (
              <div key={favorite.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
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
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSets.length === 0 && (
              <div className="flex flex-col items-start gap-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-[var(--muted-foreground)]">Nada por aqui ainda. Peça questões, um simulado ou uma revisão no chat e o bloco aparece aqui.</p>
                <Button asChild size="sm">
                  <Link href="/ai">
                    <Play className="h-4 w-4" />
                    Gerar primeiro bloco no Chat IA
                  </Link>
                </Button>
              </div>
            )}
            {filteredSets.map((set) => {
              const answered = new Set(set.questions.flatMap((question) => question.attempts.map((attempt) => attempt.questionId))).size;
              const total = set.quantity || set.questions.length || 1;
              const percent = Math.min(100, Math.round((answered / total) * 100));
              const meta = modeMeta(set.mode);
              return (
                <Link
                  key={set.id}
                  href={`/biblioteca?setId=${set.id}`}
                  className="group flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition hover:border-[var(--primary)] hover:shadow-[var(--shadow-md)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", meta.className)}>
                      <meta.icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{questionFormatLabel(set.format)}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 font-semibold">{set.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{set.subject.name} / {set.topic.name}</p>
                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>{answered} de {total} respondidas</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
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
