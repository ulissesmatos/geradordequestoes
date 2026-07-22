import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { QuestionRunner } from "@/components/question-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  bankFiltersToQuery,
  buildSourceBadge,
  getTrialBankStatus,
  listBankQuestions,
  parseBankFilters
} from "@/lib/question-bank";

// Mesmo racional da lista: aberto ao trial (limite aplicado na action) — só requireUser.
export default async function PracticeBankPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const filters = parseBankFilters(await searchParams);
  const query = bankFiltersToQuery(filters);
  const backHref = `/questoes${query ? `?${query}` : ""}`;

  const [bankStatus, result] = await Promise.all([
    getTrialBankStatus(user),
    listBankQuestions(filters)
  ]);

  if (bankStatus.isTrial && bankStatus.remaining !== null && bankStatus.remaining <= 0) {
    return (
      <div className="space-y-4">
        <BackButton href={backHref} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Lock className="h-10 w-10 text-[var(--primary)]" />
            <p className="text-lg font-semibold">Limite diário do teste gratuito atingido</p>
            <p className="max-w-md text-sm text-[var(--muted-foreground)]">
              Você já respondeu as {bankStatus.limit} questões gratuitas de hoje no banco. Volte amanhã — ou
              assine um plano para praticar sem limite.
            </p>
            <Button asChild>
              <Link href="/pricing">Ver planos →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result.questions.length === 0) {
    return (
      <div className="space-y-4">
        <BackButton href={backHref} />
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
          Nenhuma questão encontrada com esses filtros.
        </p>
      </div>
    );
  }

  const favoriteIds = await prisma.favoriteQuestion.findMany({
    where: { userId: user.id, questionId: { in: result.questions.map((q) => q.id) } },
    select: { questionId: true }
  });
  const favSet = new Set(favoriteIds.map((f) => f.questionId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton href={backHref} />
        {bankStatus.isTrial && (
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            Modo gratuito: restam {bankStatus.remaining} respostas hoje
          </span>
        )}
      </div>
      <QuestionRunner
        questions={result.questions.map((question) => ({
          ...question,
          isFavorited: favSet.has(question.id),
          sourceBadge: buildSourceBadge(question)
        }))}
        mode="study"
      />
    </div>
  );
}

function BackButton({ href }: { href: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>
        <ArrowLeft className="h-4 w-4" />
        Voltar ao banco
      </Link>
    </Button>
  );
}
