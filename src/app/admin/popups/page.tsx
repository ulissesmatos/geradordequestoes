import { Popup } from "@prisma/client";
import { createPopupAction, deletePopupAction, resetPopupViewsAction, updatePopupAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { PopupModalContent } from "@/components/popup-modal-content";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REPEAT_PRESETS, repeatPresetFromHours } from "@/lib/popups";
import { prisma } from "@/lib/prisma";

function toDatetimeLocalValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 16);
}

function audienceLabel(audience: string) {
  if (audience === "FREE") return "Só plano grátis";
  if (audience === "PAYING") return "Só assinantes";
  return "Todos os usuários";
}

function PopupForm({ action, popup }: { action: (formData: FormData) => void | Promise<void>; popup?: Popup }) {
  const repeat = repeatPresetFromHours(popup?.repeatAfterHours ?? null);
  return (
    <form key={popup?.updatedAt.getTime() ?? "new"} action={action} className="grid gap-3">
      {popup && <input type="hidden" name="id" value={popup.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="title" defaultValue={popup?.title} placeholder="Título" required />
        <Select name="kind" defaultValue={popup?.kind ?? "ANNOUNCEMENT"}>
          <option value="ANNOUNCEMENT">Aviso</option>
          <option value="UPGRADE">Upgrade de assinatura</option>
        </Select>
      </div>
      <Input name="eyebrow" defaultValue={popup?.eyebrow ?? ""} placeholder="Rótulo pequeno acima do título (opcional)" />
      <Textarea name="body" defaultValue={popup?.body ?? ""} placeholder="Corpo em markdown (negrito, listas, tabelas...)" rows={6} required />
      <Input name="imageUrl" defaultValue={popup?.imageUrl ?? ""} placeholder="URL da imagem de banner (opcional)" />
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="ctaLabel" defaultValue={popup?.ctaLabel ?? ""} placeholder="Texto do botão de ação (opcional)" />
        <Input name="ctaUrl" defaultValue={popup?.ctaUrl ?? ""} placeholder="Link do botão de ação (opcional)" />
      </div>
      <Input name="dismissLabel" defaultValue={popup?.dismissLabel ?? "Agora não"} placeholder="Texto do botão de dispensar" />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Público
          <Select name="audience" defaultValue={popup?.audience ?? "ALL"}>
            <option value="ALL">Todos os usuários</option>
            <option value="FREE">Só quem está no plano grátis (trial)</option>
            <option value="PAYING">Só assinantes pagantes</option>
          </Select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Repetição
          <Select name="repeatPreset" defaultValue={repeat.preset}>
            {REPEAT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="space-y-1 text-sm font-medium">
        Dias entre exibições (só vale se a repetição acima for &quot;Personalizado&quot;)
        <Input name="repeatCustomDays" type="number" min={1} defaultValue={repeat.customDays ?? ""} placeholder="Ex.: 3" />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          Começa em (opcional)
          <Input name="startsAt" type="datetime-local" defaultValue={toDatetimeLocalValue(popup?.startsAt ?? null)} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Termina em (opcional)
          <Input name="endsAt" type="datetime-local" defaultValue={toDatetimeLocalValue(popup?.endsAt ?? null)} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Prioridade
          <Input name="priority" type="number" defaultValue={popup?.priority ?? 0} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input name="isActive" type="checkbox" defaultChecked={popup?.isActive ?? true} /> Ativo
      </label>

      <SubmitButton>{popup ? "Salvar popup" : "Criar popup"}</SubmitButton>
    </form>
  );
}

export default async function AdminPopupsPage() {
  const popups = await prisma.popup.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
  const stats = popups.length
    ? await prisma.popupUserState.groupBy({
        by: ["popupId"],
        where: { popupId: { in: popups.map((popup) => popup.id) } },
        _count: { _all: true, dismissedAt: true, clickedAt: true }
      })
    : [];
  const statsByPopupId = new Map(stats.map((stat) => [stat.popupId, stat._count]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Popups"
        description="Avisos e CTAs de upgrade exibidos para usuários logados. Segmentação por audiência, agendamento e regra de repetição — administradores nunca veem popups."
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo popup</CardTitle>
          <CardDescription>O corpo aceita markdown — mesma sintaxe usada nos materiais de estudo.</CardDescription>
        </CardHeader>
        <CardContent>
          <PopupForm action={createPopupAction} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {popups.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum popup criado.</p>}
        {popups.map((popup) => {
          const count = statsByPopupId.get(popup.id);
          return (
            <Card key={popup.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{popup.title}</CardTitle>
                    <CardDescription>
                      {popup.kind === "UPGRADE" ? "Upgrade de assinatura" : "Aviso"} · {audienceLabel(popup.audience)} ·{" "}
                      {popup.isActive ? "Ativo" : "Inativo"}
                    </CardDescription>
                  </div>
                  <ConfirmDeleteButton action={deletePopupAction} id={popup.id} confirmMessage={`Excluir o popup "${popup.title}"?`} />
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {count?._all ?? 0} exibições · {count?.dismissedAt ?? 0} dispensas · {count?.clickedAt ?? 0} cliques
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <PopupForm action={updatePopupAction} popup={popup} />
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Preview</p>
                  <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
                    <PopupModalContent
                      popup={{
                        id: popup.id,
                        kind: popup.kind,
                        title: popup.title,
                        eyebrow: popup.eyebrow,
                        body: popup.body,
                        imageUrl: popup.imageUrl,
                        ctaLabel: popup.ctaLabel,
                        ctaUrl: popup.ctaUrl,
                        dismissLabel: popup.dismissLabel
                      }}
                    />
                  </div>
                  {(count?._all ?? 0) > 0 && (
                    <form action={resetPopupViewsAction}>
                      <input type="hidden" name="id" value={popup.id} />
                      <SubmitButton variant="outline" size="sm" className="w-full">
                        Reexibir para todos ({count?._all} já viu)
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
