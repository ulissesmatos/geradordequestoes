import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, ListChecks, Lock, Play, Search } from "lucide-react";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireUser } from "@/lib/guards";
import { difficultyLabel, questionFormatLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import {
  bankFiltersToQuery,
  buildSourceBadge,
  getTrialBankStatus,
  listBankQuestions,
  parseBankFilters
} from "@/lib/question-bank";

// Aberto também a usuários sem assinatura (trial): o limite diário de RESPOSTAS
// é aplicado na action — por isso esta página usa só requireUser, sem
// requireActiveSubscription.
export default async function QuestionBankPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const filters = parseBankFilters(await searchParams);

  const [subjects, bankStatus, result] = await Promise.all([
    prisma.subject.findMany({
      include: { topics: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" }
    }),
    getTrialBankStatus(user),
    listBankQuestions(filters)
  ]);

  const selectedSubject = subjects.find((subject) => subject.id === filters.subjectId);
  const query = bankFiltersToQuery(filters);
  const practiceHref = `/questoes/praticar${query ? `?${query}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Banco de questões</h1>
        <p className="text-[var(--muted-foreground)]">
          Questões revisadas da plataforma, prontas para praticar — muitas baseadas em provas reais.
        </p>
      </div>

      {bankStatus.isTrial && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--primary-soft-foreground)]">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            Modo gratuito: você pode responder <strong>{bankStatus.limit}</strong> questões do banco por dia.
            Restam <strong>{bankStatus.remaining}</strong> hoje.
          </span>
          <Link href="/pricing" className="font-semibold text-[var(--primary)] hover:underline">
            Ver planos →
          </Link>
        </div>
      )}

      {/* ── Filtros (form GET — URL compartilhável) ── */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" action="/questoes" className="grid gap-3 md:grid-cols-5">
            <Select name="subjectId" defaultValue={filters.subjectId ?? ""}>
              <option value="">Todas as matérias</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </Select>
            <Select name="topicId" defaultValue={filters.topicId ?? ""} disabled={!selectedSubject}>
              <option value="">{selectedSubject ? "Todos os assuntos" : "Escolha a matéria antes"}</option>
              {selectedSubject?.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.name}</option>
              ))}
            </Select>
            <Select name="difficulty" defaultValue={filters.difficulty ?? ""}>
              <option value="">Qualquer dificuldade</option>
              <option value="FACIL">Fácil</option>
              <option value="MEDIO">Médio</option>
              <option value="DIFICIL">Difícil</option>
            </Select>
            <Select name="format" defaultValue={filters.format ?? ""}>
              <option value="">Qualquer formato</option>
              <option value="CERTO_ERRADO">Certo/Errado</option>
              <option value="MULTIPLA_ESCOLHA">Múltipla escolha</option>
            </Select>
            <div className="flex gap-2">
              <Input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar no enunciado..." />
              <Button type="submit" variant="outline" size="icon" title="Filtrar">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Lista ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              {result.total} {result.total === 1 ? "questão encontrada" : "questões encontradas"}
            </CardTitle>
            {result.total > 0 && (
              <Button asChild size="sm">
                <Link href={practiceHref}>
                  <Play className="h-4 w-4" />
                  Praticar estas questões
                </Link>
              </Button>
            )}
          </div>
          <CardDescription>
            Página {result.page} de {result.pageCount}. Clique em praticar para responder o lote atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.questions.length === 0 && (
            <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">
              {filters.q || filters.subjectId || filters.difficulty || filters.format
                ? "Nenhuma questão encontrada com esses filtros. Tente ampliar a busca."
                : "O banco ainda não tem questões publicadas. Volte em breve!"}
            </p>
          )}
          {result.questions.map((question) => {
            const badge = buildSourceBadge(question);
            return (
              <div key={question.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 font-semibold text-[var(--primary-soft-foreground)]">
                    {question.subject.name}
                  </span>
                  <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 font-semibold text-[var(--muted-foreground)]">
                    {question.topic.name}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {difficultyLabel(question.difficulty)} · {questionFormatLabel(question.format)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6"><MathText text={question.statement} /></p>
                {badge && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                    {badge}
                  </p>
                )}
              </div>
            );
          })}

          {/* ── Paginação ── */}
          {result.pageCount > 1 && (
            <div className="flex items-center justify-between pt-2">
              {result.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/questoes?${bankFiltersToQuery(filters, { page: result.page - 1 })}`}>
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-xs text-[var(--muted-foreground)]">
                Página {result.page} de {result.pageCount}
              </span>
              {result.page < result.pageCount ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/questoes?${bankFiltersToQuery(filters, { page: result.page + 1 })}`}>
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
