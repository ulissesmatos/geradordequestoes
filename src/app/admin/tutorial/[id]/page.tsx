import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TutorialStep } from "@prisma/client";
import {
  createTutorialStepAction,
  deleteTutorialStepAction,
  updateTutorialStepAction
} from "@/app/admin/tutorial/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { MarkdownContent } from "@/components/markdown-content";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";

function StepForm({
  action,
  guideId,
  guideSlug,
  step
}: {
  action: (formData: FormData) => void | Promise<void>;
  guideId: string;
  guideSlug: string;
  step?: TutorialStep;
}) {
  return (
    <form key={step?.updatedAt.getTime() ?? "new"} action={action} className="grid gap-3">
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="guideSlug" value={guideSlug} />
      {step && <input type="hidden" name="id" value={step.id} />}
      <div className="grid gap-3 md:grid-cols-[80px_1fr]">
        <label className="space-y-1 text-sm font-medium">
          Ordem
          <Input name="order" type="number" defaultValue={step?.order ?? 1} required />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Título do passo
          <Input name="title" defaultValue={step?.title} required />
        </label>
      </div>
      <label className="space-y-1 text-sm font-medium">
        Corpo (markdown — negrito, listas, tabelas...)
        <Textarea name="body" defaultValue={step?.body ?? ""} rows={6} required />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Screenshot (caminho em /public, opcional)
          <Input name="imageUrl" defaultValue={step?.imageUrl ?? ""} placeholder="/tutorial/guia/01-passo.webp" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Texto alternativo da imagem
          <Input name="imageAlt" defaultValue={step?.imageAlt ?? ""} placeholder="Descreva o que a imagem mostra" />
        </label>
      </div>
      <SubmitButton>{step ? "Salvar passo" : "Adicionar passo"}</SubmitButton>
    </form>
  );
}

function StepPreview({ step }: { step: Pick<TutorialStep, "title" | "body" | "imageUrl" | "imageAlt"> }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Preview</p>
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h4 className="font-semibold">{step.title || "—"}</h4>
        <MarkdownContent content={step.body || "_sem conteúdo_"} compact />
        {step.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview de caminho arbitrário digitado pelo admin, não vale otimização do next/image.
          <img src={step.imageUrl} alt={step.imageAlt ?? ""} className="w-full rounded-md border border-[var(--border)]" />
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">Sem imagem neste passo.</p>
        )}
      </div>
    </div>
  );
}

export default async function AdminTutorialGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guide = await prisma.tutorialGuide.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } }
  });
  if (!guide) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/tutorial" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para Tutorial
      </Link>

      <AdminPageHeader
        title={guide.title}
        description={`/tutorial/${guide.slug} — gerencie os passos deste guia abaixo. Edite título/descrição/ordem do guia em si na lista.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Adicionar passo</CardTitle>
          <CardDescription>A imagem é um arquivo estático já publicado em public/tutorial/** — cole aqui o caminho, não faça upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <StepForm action={createTutorialStepAction} guideId={guide.id} guideSlug={guide.slug} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {guide.steps.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum passo criado ainda.</p>}
        {guide.steps.map((step) => (
          <Card key={step.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base">
                  Passo {step.order} — {step.title}
                </CardTitle>
                <ConfirmDeleteButton
                  action={deleteTutorialStepAction}
                  id={step.id}
                  confirmMessage={`Excluir o passo "${step.title}"?`}
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <StepForm action={updateTutorialStepAction} guideId={guide.id} guideSlug={guide.slug} step={step} />
              <StepPreview step={step} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
