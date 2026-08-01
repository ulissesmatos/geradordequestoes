import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { MathText } from "@/components/math-text";
import { QuestionRunner } from "@/components/question-runner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppSettings } from "@/lib/app-settings";
import { questionFormatLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Página pública de um bloco compartilhado (/q/<shareId>).
 *
 * Três camadas de acesso, decididas AQUI por quais colunas o Prisma busca — nunca "busca tudo
 * e esconde na tela". O anônimo nunca recebe `answer`/`explanation`/`options.isCorrect` no
 * payload do server component; não é uma questão de CSS.
 */
export default async function SharedQuestionSetPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;

  const [share, session, appSettings] = await Promise.all([
    prisma.questionSetShare.findUnique({
      where: { id: shareId, revokedAt: null },
      include: {
        questionSet: {
          select: {
            id: true,
            title: true,
            mode: true,
            quantity: true,
            subject: { select: { name: true } },
            topic: { select: { name: true } },
            user: { select: { name: true } }
          }
        }
      }
    }),
    auth(),
    getAppSettings()
  ]);

  if (!share) notFound();

  const authorFirstName = share.questionSet.user.name.split(" ")[0];
  const userId = session?.user?.id;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={appSettings.logoUrl} appName={appSettings.appName} sticky={false} />

      <section className="mx-auto max-w-3xl px-4 py-10 md:py-14">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{share.questionSet.title}</CardTitle>
            <CardDescription>
              {share.questionSet.subject.name} · {share.questionSet.topic.name} · {share.questionSet.quantity}{" "}
              {share.questionSet.quantity === 1 ? "questão" : "questões"} · compartilhado por {authorFirstName}
            </CardDescription>
          </CardHeader>
        </Card>

        {userId ? (
          <LoggedInView questionSetId={share.questionSet.id} userId={userId} />
        ) : (
          <AnonymousPreview questionSetId={share.questionSet.id} quantity={share.questionSet.quantity} />
        )}
      </section>

      <SiteFooter />
    </main>
  );
}

/**
 * Quem já tem conta responde o bloco INTEIRO normalmente — reaproveita QuestionRunner sem
 * nenhuma alteração, só variando o que este server component seleciona do Prisma. O envio de
 * resposta usa `answerQuestionAction`, que já ganhou a cláusula de acesso a bloco compartilhado.
 */
async function LoggedInView({ questionSetId, userId }: { questionSetId: string; userId: string }) {
  const [questions, subscribed] = await Promise.all([
    prisma.question.findMany({
      where: { questionSetId },
      orderBy: { orderInSet: "asc" },
      include: {
        subject: true,
        topic: true,
        options: { orderBy: { order: "asc" } },
        favorites: { where: { userId }, select: { id: true } }
      }
    }),
    hasActiveSubscription({ id: userId })
  ]);

  const questionsWithMeta = questions.map((q) => ({ ...q, isFavorited: q.favorites.length > 0 }));

  return (
    <div className="space-y-4">
      {!subscribed && (
        <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-[var(--primary-soft-foreground)]">
              Você está respondendo um bloco compartilhado. No plano gratuito as respostas contam na sua cota diária
              do banco de questões.
            </p>
            <Button asChild size="sm">
              <Link href="/assinatura">
                <Sparkles className="h-4 w-4" />
                Assinar para gerar meus blocos
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <QuestionRunner questions={questionsWithMeta} mode="study" />
    </div>
  );
}

/**
 * Visitante sem conta: só a 1ª questão, sem gabarito/justificativa (nunca selecionados do
 * banco), sem capacidade de responder. As demais aparecem só como itens bloqueados — nem o
 * enunciado delas é buscado, para não virar um jeito de "ler o bloco todo" sem conta.
 */
async function AnonymousPreview({ questionSetId, quantity }: { questionSetId: string; quantity: number }) {
  const first = await prisma.question.findFirst({
    where: { questionSetId, orderInSet: 1 },
    select: {
      statement: true,
      supportText: true,
      format: true,
      options: { orderBy: { order: "asc" }, select: { label: true, text: true } }
    }
  });

  if (!first) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
            Questão 1 de {quantity} · {questionFormatLabel(first.format)}
          </span>
          {first.supportText && (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm leading-6">
              <MathText text={first.supportText} />
            </p>
          )}
          <p className="text-base leading-7">
            <MathText text={first.statement} />
          </p>
          <ul className="space-y-2">
            {first.options.map((option) => (
              <li
                key={option.label}
                className="rounded-md border border-[var(--border)] px-3 py-2.5 text-sm"
              >
                <strong className="mr-2">{option.label})</strong>
                <MathText text={option.text} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {quantity > 1 && (
        <div className="space-y-1.5">
          {Array.from({ length: quantity - 1 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted-foreground)]"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Questão {index + 2} de {quantity}
            </div>
          ))}
        </div>
      )}

      <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-semibold text-[var(--primary-soft-foreground)]">
            Crie sua conta gratuita para responder todas as {quantity} questões
          </p>
          <Button asChild size="lg">
            <Link href="/register">
              <Sparkles className="h-4 w-4" />
              Criar conta grátis
            </Link>
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            Já tem conta?{" "}
            <Link href="/login" className="font-semibold underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
