import { BookOpen } from "lucide-react";
import { createReferenceAction, deleteReferenceAction } from "@/app/admin/referencias/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export default async function AdminReferenciasPage() {
  const [subjects, documents] = await Promise.all([
    prisma.subject.findMany({ include: { topics: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.referenceDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } }
    })
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Materiais de referência"
        description="Provas reais, gabaritos, leis e resumos que a IA consulta (busca por palavra-chave) para gerar questões fiéis e conferir gabaritos."
      />

      {/* ── Adicionar material ── */}
      <Card>
        <CardHeader>
          <CardTitle>Adicionar material</CardTitle>
          <CardDescription>
            Cole o texto ou envie um PDF com texto extraível. O conteúdo é dividido em trechos e indexado para busca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createReferenceAction} className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              Título
              <Input name="title" required placeholder="Ex.: Prova CEBRASPE — PF Agente 2021" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Fonte
              <Input name="source" placeholder="Ex.: CEBRASPE 2021" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Tipo
              <Select name="kind" defaultValue="PROVA">
                <option value="PROVA">Prova</option>
                <option value="GABARITO">Gabarito</option>
                <option value="LEI">Lei</option>
                <option value="RESUMO">Resumo</option>
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
                      <option key={t.id} value={t.id}>{s.name} / {t.name}</option>
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
        <CardHeader><CardTitle>Materiais cadastrados ({documents.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
              <tr><th className="py-2">Título</th><th>Tipo</th><th>Matéria</th><th>Trechos</th><th>Criado</th><th></th></tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-[var(--border)]">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[var(--primary)]" />
                      <span className="font-medium">{doc.title}</span>
                    </div>
                    {doc.source && <span className="text-xs text-[var(--muted-foreground)]">{doc.source}</span>}
                  </td>
                  <td><StatusBadge tone="neutral">{doc.kind}</StatusBadge></td>
                  <td>{doc.subjectId ? subjectName.get(doc.subjectId) ?? "—" : "—"}</td>
                  <td>{doc._count.chunks}</td>
                  <td className="text-[var(--muted-foreground)]">{formatDate(doc.createdAt)}</td>
                  <td className="text-right">
                    <ConfirmDeleteButton action={deleteReferenceAction} id={doc.id} confirmMessage={`Excluir "${doc.title}" e seus trechos?`} />
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr><td colSpan={6} className="py-5 text-center text-[var(--muted-foreground)]">Nenhum material cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
