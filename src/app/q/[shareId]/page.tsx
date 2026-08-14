import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { QuestionSetShareVisibility, type Role } from "@prisma/client";
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
import { SHARE_PAID_ONLY_FREE_QUESTIONS } from "@/lib/question-limits";
import { hasActiveSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Página pública de um bloco compartilhado (/q/<shareId>).
 *
 * Acesso decidido em duas dimensões: se o visitante tem conta (LoggedInView vs. as visões
 * anônimas) e a `visibility` do link (EVERYONE / LOGGED_IN / PAID_ONLY — ver schema.prisma).
 * Segurança continua resolvida AQUI por quais colunas o Prisma busca — nunca "busca tudo e
 * esconde na tela": o anônimo só recebe `answer`/`explanation`/`options.isCorrect` das questões
 * que a visibility do link efetivamente libera para ele.
 */
export default async function SharedQuestionSetPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;

  const [share, session, appSettings] = await Promise.all([
    prisma.questionSetShare.findUnique({
      where: { id: shareId, revokedAt: null },
      select: {
        visibility: true,
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

  // Sessão JWT pode estar desatualizada (ex.: assinatura ativada há segundos); busca leve e
  // fresca do banco só do necessário para decidir entitlement — mesmo espírito de requireUser,
  // sem o redirect (esta página aceita visitante anônimo).
  const viewer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;

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
          <LoggedInView
            questionSetId={share.questionSet.id}
            userId={userId}
            role={viewer?.role}
            visibility={share.visibility}
          />
        ) : share.visibility === QuestionSetShareVisibility.EVERYONE ? (
          <AnonymousOpenView questionSetId={share.questionSet.id} />
        ) : share.visibility === QuestionSetShareVisibility.PAID_ONLY ? (
          <AnonymousPaidOnlyPreview questionSetId={share.questionSet.id} quantity={share.questionSet.quantity} />
        ) : (
          <AnonymousSignupPreview questionSetId={share.questionSet.id} quantity={share.questionSet.quantity} />
        )}
      </section>

      <SiteFooter />
    </main>
  );
}

/**
 * Quem já tem conta responde o bloco INTEIRO — reaproveita QuestionRunner sem alteração na
 * mecânica de resposta, só variando entitlement (assinado/admin vs. grátis) e a `visibility`
 * do link para decidir se alguma questão fica atrás do paywall (`lockedFrom`). O envio de
 * resposta usa `answerQuestionAction`, que já ganhou a mesma checagem de PAID_ONLY do lado
 * do servidor — o `lockedFrom` aqui é só a UI, não a autorização de verdade.
 */
async function LoggedInView({
  questionSetId,
  userId,
  role,
  visibility
}: {
  questionSetId: string;
  userId: string;
  role: Role | undefined;
  visibility: QuestionSetShareVisibility;
}) {
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
    hasActiveSubscription({ id: userId, role })
  ]);

  const questionsWithMeta = questions.map((q) => ({ ...q, isFavorited: q.favorites.length > 0, isReviewed: Boolean(q.reviewedById) }));

  const restricted = visibility === QuestionSetShareVisibility.PAID_ONLY && !subscribed;
  const lockedFrom = restricted ? SHARE_PAID_ONLY_FREE_QUESTIONS + 1 : undefined;

  return (
    <div className="space-y-4">
      {restricted ? (
        <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-[var(--primary-soft-foreground)]">
              Este bloco é exclusivo para assinantes. Você pode responder as {SHARE_PAID_ONLY_FREE_QUESTIONS} primeiras
              questões gratuitamente — as demais ficam salvas aqui, liberadas assim que você assinar.
            </p>
            <Button asChild size="sm">
              <Link href="/pricing">
                <Sparkles className="h-4 w-4" />
                Ver planos
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        !subscribed && (
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
        )
      )}
      <QuestionRunner questions={questionsWithMeta} mode="study" lockedFrom={lockedFrom} lockHref="/pricing" />
    </div>
  );
}

/**
 * Link "liberado para todos" (EVERYONE, só admin cria): visitante sem conta responde o bloco
 * INTEIRO, sem fricção nenhuma — decisão deliberada do admin ao escolher essa opção, então a
 * proteção "não é questão de CSS" do resto do arquivo é intencionalmente relaxada só aqui.
 * `persistAnswers={false}` porque não existe conta para guardar a tentativa.
 */
async function AnonymousOpenView({ questionSetId }: { questionSetId: string }) {
  const questions = await prisma.question.findMany({
    where: { questionSetId },
    orderBy: { orderInSet: "asc" },
    include: { subject: true, topic: true, options: { orderBy: { order: "asc" } } }
  });
  if (questions.length === 0) notFound();

  const questionsWithMeta = questions.map((q) => ({ ...q, isReviewed: Boolean(q.reviewedById) }));

  return (
    <div className="space-y-4">
      <Card className="border-[var(--border)] bg-[var(--surface-subtle)]">
        <CardContent className="p-4 text-sm text-[var(--muted-foreground)]">
          Link liberado para todo mundo responder, sem precisar de conta. Suas respostas não ficam salvas porque você
          não está logado —{" "}
          <Link href="/register" className="font-semibold underline">
            crie uma conta grátis
          </Link>{" "}
          para guardar seu histórico.
        </CardContent>
      </Card>
      <QuestionRunner questions={questionsWithMeta} mode="study" persistAnswers={false} showTools={false} />
    </div>
  );
}

/**
 * Link "só assinantes" (PAID_ONLY) e visitante sem conta: bug corrigido aqui — antes o
 * anônimo via só um preview estático da 1ª questão, sem poder responder nada. Agora ele
 * responde de verdade a 1ª (com correção e explicação), igual a um usuário logado responderia,
 * só que sem persistir (sem conta = sem onde guardar). As demais continuam bloqueadas, mesmo
 * padrão do preview de cadastro abaixo.
 */
async function AnonymousPaidOnlyPreview({ questionSetId, quantity }: { questionSetId: string; quantity: number }) {
  const first = await prisma.question.findFirst({
    where: { questionSetId, orderInSet: 1 },
    include: { subject: true, topic: true, options: { orderBy: { order: "asc" } } }
  });
  if (!first) notFound();

  const firstWithMeta = { ...first, isReviewed: Boolean(first.reviewedById) };
  const remaining = quantity - 1;
  const freeWithAccount = Math.max(0, SHARE_PAID_ONLY_FREE_QUESTIONS - 1);

  return (
    <div className="space-y-4">
      <QuestionRunner questions={[firstWithMeta]} mode="study" persistAnswers={false} showTools={false} />

      {remaining > 0 && (
        <div className="space-y-1.5">
          {Array.from({ length: remaining }, (_, index) => (
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
            {quantity > SHARE_PAID_ONLY_FREE_QUESTIONS
              ? `Crie sua conta gratuita para responder mais ${freeWithAccount} ${freeWithAccount === 1 ? "questão" : "questões"} deste bloco`
              : `Crie sua conta gratuita para responder todas as ${quantity} questões`}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Este bloco é exclusivo para assinantes.{" "}
            {quantity > SHARE_PAID_ONLY_FREE_QUESTIONS
              ? `Mesmo com conta grátis, só as ${SHARE_PAID_ONLY_FREE_QUESTIONS} primeiras questões ficam liberadas — assine um plano para desbloquear o restante.`
              : "Com uma conta grátis você já responde todas."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="lg">
              <Link href="/register">
                <Sparkles className="h-4 w-4" />
                Criar conta grátis
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">Ver planos</Link>
            </Button>
          </div>
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

/**
 * Link padrão (LOGGED_IN — dono comum, ou admin que escolheu "só quem tem conta"): visitante
 * sem conta só a 1ª questão, sem gabarito/justificativa (nunca selecionados do banco), sem
 * capacidade de responder. As demais aparecem só como itens bloqueados — nem o enunciado delas
 * é buscado, para não virar um jeito de "ler o bloco todo" sem conta.
 */
async function AnonymousSignupPreview({ questionSetId, quantity }: { questionSetId: string; quantity: number }) {
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
          <p className="whitespace-pre-line text-base leading-7">
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
