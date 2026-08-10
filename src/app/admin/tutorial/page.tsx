import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TutorialGuide } from "@prisma/client";
import { createTutorialGuideAction, deleteTutorialGuideAction, updateTutorialGuideAction } from "@/app/admin/tutorial/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";

/**
 * CRUD de dois níveis: aqui só os guias (título, ícone, ordem, publicado/rascunho). Os passos
 * de cada guia são geridos em /admin/tutorial/[id] — mesmo corte de materiais de referência
 * (lista de documentos aqui, questões extraídas no detalhe).
 */

function GuideForm({ action, guide }: { action: (formData: FormData) => void | Promise<void>; guide?: TutorialGuide }) {
  return (
    <form key={guide?.updatedAt.getTime() ?? "new"} action={action} className="grid gap-3">
      {guide && <input type="hidden" name="id" value={guide.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="title" defaultValue={guide?.title} placeholder="Título do guia" required />
        <Input name="icon" defaultValue={guide?.icon ?? "ti-book-2"} placeholder="Ícone Tabler (ex.: ti-sparkles)" />
      </div>
      <Input name="description" defaultValue={guide?.description} placeholder="Descrição curta (aparece no card do índice)" required />
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="ctaLabel" defaultValue={guide?.ctaLabel ?? ""} placeholder="Texto do botão final (opcional)" />
        <Input name="ctaUrl" defaultValue={guide?.ctaUrl ?? ""} placeholder="Link do botão final (opcional)" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Ordem de exibição
          <Input name="displayOrder" type="number" defaultValue={guide?.displayOrder ?? 0} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input name="isPublished" type="checkbox" defaultChecked={guide?.isPublished ?? true} /> Publicado
        </label>
      </div>
      <SubmitButton>{guide ? "Salvar guia" : "Criar guia"}</SubmitButton>
    </form>
  );
}

export default async function AdminTutorialPage() {
  const guides = await prisma.tutorialGuide.findMany({
    orderBy: { displayOrder: "asc" },
    include: { _count: { select: { steps: true } } }
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tutorial"
        description="Guias de como usar a plataforma, exibidos em /tutorial para usuários logados. Slug e URL são gerados a partir do título e não mudam depois — editar o título não quebra links já compartilhados."
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo guia</CardTitle>
          <CardDescription>Depois de criar, adicione os passos (texto + screenshot) na tela de detalhe do guia.</CardDescription>
        </CardHeader>
        <CardContent>
          <GuideForm action={createTutorialGuideAction} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {guides.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum guia criado ainda.</p>}
        {guides.map((guide) => (
          <Card key={guide.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <i className={`ti ${guide.icon} text-lg text-[var(--primary)]`} aria-hidden />
                    {guide.title}
                  </CardTitle>
                  <CardDescription>
                    /tutorial/{guide.slug} · {guide._count.steps} {guide._count.steps === 1 ? "passo" : "passos"} ·{" "}
                    {guide.isPublished ? (
                      <StatusBadge tone="success">Publicado</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Rascunho</StatusBadge>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/tutorial/${guide.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
                  >
                    Gerenciar passos
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <ConfirmDeleteButton
                    action={deleteTutorialGuideAction}
                    id={guide.id}
                    confirmMessage={`Excluir o guia "${guide.title}" e seus ${guide._count.steps} passo(s)?`}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GuideForm action={updateTutorialGuideAction} guide={guide} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
