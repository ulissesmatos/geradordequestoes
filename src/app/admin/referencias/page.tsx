import Link from "next/link";
import { BookOpen, Eye } from "lucide-react";
import { ReferenceExtractionStatus, ReferenceKind, StudyMaterialStatus } from "@prisma/client";
import { createReferenceAction, deleteReferenceAction } from "@/app/admin/referencias/actions";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { ExtractionModelPicker } from "@/components/admin/extraction-model-picker";
import { ReclassifyAllButton } from "@/components/admin/reclassify-all-button";
import { ReferenceProcessButton } from "@/components/admin/reference-process-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getModelOptionsForProvider } from "@/lib/ai/model-catalog";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return formatDateBR(date);
}

const TABS: AdminTabDef[] = [
  { value: "referencia", label: "Materiais de referência" },
  { value: "alunos", label: "Materiais dos alunos" }
];

const extractionMeta: Record<ReferenceExtractionStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  [ReferenceExtractionStatus.PENDING]: { label: "Não processado", tone: "neutral" },
  [ReferenceExtractionStatus.PROCESSING]: { label: "Parcial", tone: "warning" },
  [ReferenceExtractionStatus.DONE]: { label: "Processado", tone: "success" },
  [ReferenceExtractionStatus.ERROR]: { label: "Erro", tone: "danger" }
};

/** Kinds onde extrair QUESTÕES estruturadas faz sentido como fluxo principal. Para os demais, o material já fica
 * pesquisável pelo chat assim que é indexado, então a extração vira uma ação secundária/opcional. */
const questionSourceKinds: ReferenceKind[] = [ReferenceKind.PROVA, ReferenceKind.GABARITO];

export default async function AdminMateriaisHubPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab === "alunos" ? "alunos" : "referencia";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Materiais" description="Materiais de referência cadastrados pela equipe e materiais de estudo gerados pelos alunos via chat." />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/referencias" />
      {activeTab === "referencia" && <ReferenciaTab />}
      {activeTab === "alunos" && <AlunosTab status={params.status} />}
    </div>
  );
}

async function ReferenciaTab() {
  const [subjects, documents, aiSettings, questionsBySubject] = await Promise.all([
    prisma.subject.findMany({ include: { topics: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.referenceDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true, questions: true } } }
    }),
    getAiSettings(),
    // Distribuição real por matéria de cada material. Uma prova de concurso mistura matérias,
    // então a matéria única do documento não descreve o que está lá dentro.
    prisma.referenceQuestion.groupBy({
      by: ["documentId", "subjectId"],
      _count: { _all: true }
    })
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  const breakdown = new Map<string, { classified: { name: string; count: number }[]; unclassified: number }>();
  for (const row of questionsBySubject) {
    const entry = breakdown.get(row.documentId) ?? { classified: [], unclassified: 0 };
    if (row.subjectId) {
      entry.classified.push({ name: subjectName.get(row.subjectId) ?? "(matéria removida)", count: row._count._all });
    } else {
      entry.unclassified += row._count._all;
    }
    breakdown.set(row.documentId, entry);
  }
  for (const entry of breakdown.values()) entry.classified.sort((a, b) => b.count - a.count);
  const totalUnclassified = [...breakdown.values()].reduce((sum, e) => sum + e.unclassified, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        Provas reais, gabaritos, editais, leis e resumos/apostilas. Todo material vira trechos pesquisáveis pelo chat assim que é
        salvo — &quot;Processar com IA&quot; é um passo à parte, só para extrair questões estruturadas (enunciado, gabarito, pegadinha) de provas.
      </p>

      {totalUnclassified > 0 && <ReclassifyAllButton pending={totalUnclassified} />}

      {/* ── Adicionar material ── */}
      <Card>
        <CardHeader>
          <CardTitle>Adicionar material</CardTitle>
          <CardDescription>
            Cole o texto ou envie um PDF com texto extraível — provas, gabaritos, editais, leis, resumos ou apostilas.
            O conteúdo é indexado na hora e já fica disponível para o chat consultar. Para provas, use depois o botão
            &quot;Processar com IA&quot; para também extrair cada questão em formato estruturado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createReferenceAction} className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              Título
              <Input name="title" required placeholder="Ex.: Edital CEBRASPE — PRF 2026" />
              <p className="text-xs font-normal text-[var(--muted-foreground)]">
                Um título claro ajuda a IA a encontrar este material quando o aluno perguntar sobre ele no chat.
              </p>
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Fonte
              <Input name="source" placeholder="Ex.: CEBRASPE 2026" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Tipo
              <Select name="kind" defaultValue="PROVA">
                <option value="PROVA">Prova</option>
                <option value="GABARITO">Gabarito</option>
                <option value="EDITAL">Edital</option>
                <option value="LEI">Lei</option>
                <option value="RESUMO">Resumo / apostila</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Assunto (define a matéria)
              <Select name="topicId" defaultValue="">
                <option value="">— Sem assunto específico —</option>
                {subjects.map((s) => (
                  <optgroup key={s.id} label={s.name}>
                    {s.topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>
            <label className="block space-y-1 text-sm font-medium md:col-span-2">
              Texto do material
              <Textarea name="text" rows={8} placeholder="Cole aqui o enunciado/gabarito/teoria..." className="font-mono text-xs" />
            </label>
            <label className="block space-y-1 text-sm font-medium md:col-span-2">
              ou envie um PDF (texto extraível)
              <Input name="file" type="file" accept="application/pdf" className="cursor-pointer" />
            </label>
            <div className="md:col-span-2">
              <SubmitButton>Adicionar e indexar</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Lista ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Materiais cadastrados ({documents.length})</CardTitle>
            <ExtractionModelPicker
              providerName={providerLabel(aiSettings.provider)}
              defaultModel={aiSettings.model}
              currentModel={aiSettings.extractionModel}
              options={getModelOptionsForProvider(aiSettings.provider)}
            />
          </div>
          <CardDescription>
            A IA da extração roda uma vez por material — vale usar um modelo forte aqui, mesmo que o chat use um modelo
            econômico: a qualidade do banco extraído é o que o chat consulta depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr><th className="py-2">Título</th><th>Tipo</th><th>Matérias das questões</th><th>Trechos</th><th>Extração IA</th><th>Criado</th><th></th></tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const meta = extractionMeta[doc.extractionStatus];
                const isQuestionSource = questionSourceKinds.includes(doc.kind);
                return (
                  <tr key={doc.id} className="border-t border-[var(--border)]">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-[var(--primary)]" />
                        <Link href={`/admin/referencias/${doc.id}`} className="font-medium text-[var(--primary)] hover:underline">
                          {doc.title}
                        </Link>
                      </div>
                      {doc.source && <span className="text-xs text-[var(--muted-foreground)]">{doc.source}</span>}
                    </td>
                    <td><StatusBadge tone="neutral">{doc.kind}</StatusBadge></td>
                    <td className="py-3">
                      <SubjectBreakdown
                        entry={breakdown.get(doc.id)}
                        documentSubject={doc.subjectId ? subjectName.get(doc.subjectId) ?? null : null}
                      />
                    </td>
                    <td>{doc._count.chunks}</td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {isQuestionSource ? (
                          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        ) : (
                          <StatusBadge tone={doc._count.chunks > 0 ? "success" : "neutral"}>
                            {doc._count.chunks > 0 ? "Indexado e pesquisável" : "Sem conteúdo"}
                          </StatusBadge>
                        )}
                        {doc._count.questions > 0 && (
                          <span className="text-xs text-[var(--muted-foreground)]">{doc._count.questions} questões</span>
                        )}
                      </div>
                    </td>
                    <td className="text-[var(--muted-foreground)]">{formatDate(doc.createdAt)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {doc.extractionStatus !== ReferenceExtractionStatus.DONE && (
                          <ReferenceProcessButton
                            documentId={doc.id}
                            totalChunks={doc._count.chunks}
                            initialProcessed={doc.extractionCursor}
                            variant={isQuestionSource ? "primary" : "secondary"}
                            label={
                              doc.extractionStatus === ReferenceExtractionStatus.PENDING
                                ? isQuestionSource
                                  ? "Processar com IA"
                                  : "Extrair questões (opcional)"
                                : "Continuar"
                            }
                          />
                        )}
                        <Link
                          href={`/admin/referencias/${doc.id}`}
                          title="Ver questões extraídas"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Link>
                        <ConfirmDeleteButton action={deleteReferenceAction} id={doc.id} label="" confirmMessage={`Excluir "${doc.title}", seus trechos e questões extraídas?`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 && (
                <tr><td colSpan={7} className="py-5 text-center text-[var(--muted-foreground)]">Nenhum material cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Distribuição por matéria das questões extraídas de um material. Substitui a antiga coluna
 * que mostrava só a matéria do documento — inútil em prova multidisciplinar, onde o documento
 * costuma ficar sem matéria e as questões são de 5 ou 6 matérias diferentes.
 */
function SubjectBreakdown({
  entry,
  documentSubject
}: {
  entry?: { classified: { name: string; count: number }[]; unclassified: number };
  documentSubject: string | null;
}) {
  if (!entry || (entry.classified.length === 0 && entry.unclassified === 0)) {
    // Sem questões extraídas: cai para a matéria do documento (ex.: edital indexado).
    return <span className="text-[var(--muted-foreground)]">{documentSubject ?? "—"}</span>;
  }
  const shown = entry.classified.slice(0, 3);
  const rest = entry.classified.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <StatusBadge key={item.name} tone="info">
          {item.name} · {item.count}
        </StatusBadge>
      ))}
      {rest > 0 && <span className="text-xs text-[var(--muted-foreground)]">+{rest}</span>}
      {entry.unclassified > 0 && <StatusBadge tone="warning">{entry.unclassified} sem matéria</StatusBadge>}
    </div>
  );
}

async function AlunosTab({ status: statusRaw }: { status?: string }) {
  const status = Object.values(StudyMaterialStatus).includes(statusRaw as StudyMaterialStatus)
    ? (statusRaw as StudyMaterialStatus)
    : undefined;

  const [materials, total, ready, archived] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: status ? { status } : undefined,
      include: { user: true, subject: true, topic: true },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.studyMaterial.count(),
    prisma.studyMaterial.count({ where: { status: StudyMaterialStatus.READY } }),
    prisma.studyMaterial.count({ where: { status: StudyMaterialStatus.ARCHIVED } })
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">Materiais de estudo privados gerados pelos alunos via chat.</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total" value={total} />
        <Metric title="Prontos" value={ready} />
        <Metric title="Arquivados" value={archived} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Controle rápido por status.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <FilterLink href="/admin/referencias?tab=alunos" active={!status}>Todos</FilterLink>
          {Object.values(StudyMaterialStatus).map((item) => (
            <FilterLink key={item} href={`/admin/referencias?tab=alunos&status=${item}`} active={status === item}>
              {item}
            </FilterLink>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {materials.map((material) => (
          <Card key={material.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{material.title}</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {material.user.email} / {material.subject?.name ?? "Sem matéria"} / {material.topic?.name ?? "Sem assunto"}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                  {material.status}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">{material.prompt}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link className="font-semibold text-[var(--primary)] hover:underline" href={`/materiais/${material.id}`}>
                  Abrir como aluno
                </Link>
                <Link className="font-semibold text-[var(--primary)] hover:underline" href={`/materiais/${material.id}/pdf`}>
                  Baixar PDF
                </Link>
                <span className="text-[var(--muted-foreground)]">{formatDateTimeBR(material.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {materials.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum material encontrado</CardTitle>
              <CardDescription>Quando alunos gerarem materiais no chat, eles aparecerão aqui.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{value}</CardTitle>
        <CardDescription>{title}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      className={`rounded-md border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}
