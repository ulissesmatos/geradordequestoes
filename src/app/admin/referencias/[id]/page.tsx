import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ImageIcon, Layers, Lightbulb, MapPin, RotateCcw, X } from "lucide-react";
import { ReferenceExtractionStatus, ReferenceKind } from "@prisma/client";
import { resetExtractionAction } from "@/app/admin/referencias/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ReferenceClassificationPanel } from "@/components/admin/reference-classification-panel";
import { ReferenceProcessButton } from "@/components/admin/reference-process-button";
import { ReferenceSubjectSelect } from "@/components/admin/reference-subject-select";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const questionSourceKinds: ReferenceKind[] = [ReferenceKind.PROVA, ReferenceKind.GABARITO];

async function loadDocument(id: string) {
  return prisma.referenceDocument.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { ordinal: "asc" } },
      chunks: { orderBy: { ordinal: "asc" } }
    }
  });
}

type ExtractedQuestionRow = NonNullable<Awaited<ReturnType<typeof loadDocument>>>["questions"][number];

/** Agrupa questões consecutivas que compartilham o mesmo texto de apoio ("bloco"). */
function groupQuestions(questions: ExtractedQuestionRow[]) {
  const groups: { supportText: string | null; items: ExtractedQuestionRow[] }[] = [];
  for (const question of questions) {
    const last = groups[groups.length - 1];
    if (last && last.supportText && question.supportText === last.supportText) {
      last.items.push(question);
    } else {
      groups.push({ supportText: question.supportText, items: [question] });
    }
  }
  return groups;
}

export default async function ReferenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [document, subjects] = await Promise.all([
    loadDocument(id),
    prisma.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);
  if (!document) notFound();

  const done = document.extractionStatus === ReferenceExtractionStatus.DONE;
  const isQuestionSource = questionSourceKinds.includes(document.kind);
  const groups = groupQuestions(document.questions);
  let questionCounter = 0;

  // Distribuição real por matéria: uma prova mistura matérias, então o número que importa
  // é este, não a matéria única do documento.
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const counts = new Map<string, number>();
  let unclassified = 0;
  for (const question of document.questions) {
    if (!question.subjectId) {
      unclassified += 1;
      continue;
    }
    const name = subjectNameById.get(question.subjectId) ?? "(matéria removida)";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const distribution = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/referencias"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Materiais de referência
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          title={document.title}
          description={`${document.kind}${document.source ? ` · ${document.source}` : ""} · ${document.chunks.length} trechos · ${document.questions.length} questões extraídas`}
        />
        <div className="flex items-center gap-2">
          {!done && (
            <ReferenceProcessButton
              documentId={document.id}
              totalChunks={document.chunks.length}
              variant={isQuestionSource ? "primary" : "secondary"}
              label={
                document.extractionStatus === ReferenceExtractionStatus.PENDING
                  ? isQuestionSource
                    ? "Processar com IA"
                    : "Extrair questões (opcional)"
                  : "Continuar extração"
              }
            />
          )}
          {(done || document.questions.length > 0) && (
            <form action={resetExtractionAction}>
              <input type="hidden" name="id" value={document.id} />
              <SubmitButton variant="outline" size="sm">
                <RotateCcw className="h-3.5 w-3.5" />
                Reprocessar do zero
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {document.extractionStatus === ReferenceExtractionStatus.ERROR && document.extractionError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Última extração falhou: {document.extractionError}
        </p>
      )}

      {document.questions.length > 0 && (
        <ReferenceClassificationPanel
          documentId={document.id}
          distribution={distribution}
          unclassified={unclassified}
          subjects={subjects}
        />
      )}

      {document.questions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--muted-foreground)]">
            {isQuestionSource
              ? <>Nenhuma questão extraída ainda. Clique em &quot;Processar com IA&quot; para escanear o material.</>
              : <>Este material não tem questões extraídas — ele já está indexado (veja os trechos abaixo) e disponível para o chat consultar.</>}
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <div className="space-y-5">
          {groups.map((group, groupIndex) =>
            group.supportText ? (
              <div key={`block-${groupIndex}`} className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary-soft)]/25 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                  <Layers className="h-3.5 w-3.5" />
                  Bloco · {group.items.length} {group.items.length === 1 ? "questão depende" : "questões dependem"} deste texto
                </div>
                <details className="mb-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" open>
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">Texto de apoio</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{group.supportText}</p>
                </details>
                <div className="space-y-3">
                  {group.items.map((question) => {
                    questionCounter += 1;
                    return (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        index={questionCounter}
                        documentId={document.id}
                        subjects={subjects}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div key={`loose-${groupIndex}`} className="space-y-4">
                {group.items.map((question) => {
                  questionCounter += 1;
                  return (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        index={questionCounter}
                        documentId={document.id}
                        subjects={subjects}
                      />
                    );
                })}
              </div>
            )
          )}
        </div>
      )}

      {document.chunks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Trechos indexados ({document.chunks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">
              É este conteúdo, dividido em trechos, que o chat encontra ao buscar neste material.
            </p>
            <div className="space-y-1.5">
              {document.chunks.map((chunk, i) => (
                <details key={chunk.id} className="rounded-md border border-[var(--border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                    Trecho {i + 1}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">
                    {chunk.content}
                  </p>
                </details>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  documentId,
  subjects
}: {
  question: ExtractedQuestionRow;
  index: number;
  documentId: string;
  subjects: { id: string; name: string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Questão {index}
            {question.topicHint && <span className="normal-case tracking-normal">· {question.topicHint}</span>}
            <ReferenceSubjectSelect
              questionId={question.id}
              documentId={documentId}
              subjectId={question.subjectId}
              subjects={subjects}
            />
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Palpite da IA, mantido visível: é a origem da classificação e ajuda a auditar
                quando o admin discorda da matéria escolhida. */}
            {question.subjectHint && <StatusBadge tone="neutral">IA: {question.subjectHint}</StatusBadge>}
            {question.regionHint && (
              <StatusBadge tone="neutral">
                <MapPin className="h-3 w-3" />
                {question.regionHint}
              </StatusBadge>
            )}
            {question.answer ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  question.answer === "CERTO" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                )}
              >
                {question.answer === "CERTO" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                Gabarito: {question.answer === "CERTO" ? "Certo" : "Errado"}
              </span>
            ) : question.answerText ? (
              <StatusBadge tone="info">Gabarito: {question.answerText}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Sem gabarito</StatusBadge>
            )}
            {question.hasImage && (
              <StatusBadge tone="warning">
                <ImageIcon className="h-3 w-3" />
                Imagem/charge
              </StatusBadge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm leading-6">{question.statement}</p>
        {question.imageDescription && (
          <p className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <ImageIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Imagem esperada: {question.imageDescription}
          </p>
        )}
        {question.explanation && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--surface-subtle)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">
            {question.explanation}
          </p>
        )}
        {question.trickNote && (
          <p className="rounded-[var(--radius-sm)] border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-3 text-xs leading-5 text-[var(--primary)]">
            <Lightbulb className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Pegadinha: {question.trickNote}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
