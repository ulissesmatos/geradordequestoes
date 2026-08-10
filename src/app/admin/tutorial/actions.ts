"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";
import { logAdminAction } from "@/lib/audit";
import { slugify } from "@/lib/utils";

/** Mesmo padrão de uniquePlanSlug (admin-actions.ts): base + sufixo -2, -3… até não colidir. */
async function uniqueTutorialGuideSlug(title: string) {
  const base = slugify(title) || "guia";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.tutorialGuide.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function guideDataFromForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    icon: String(formData.get("icon") ?? "").trim() || "ti-book-2",
    ctaLabel: optionalString(formData, "ctaLabel"),
    ctaUrl: optionalString(formData, "ctaUrl"),
    displayOrder: Number(formData.get("displayOrder") ?? 0) || 0,
    isPublished: formData.get("isPublished") === "on"
  };
}

export async function createTutorialGuideAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = guideDataFromForm(formData);
  if (!data.title) throw new Error("Título é obrigatório.");
  const slug = await uniqueTutorialGuideSlug(data.title);
  const guide = await prisma.tutorialGuide.create({ data: { ...data, slug } });
  await logAdminAction(admin, { action: "create", entity: "TutorialGuide", entityId: guide.id, summary: guide.title });
  revalidatePath("/admin/tutorial");
  revalidatePath("/tutorial");
}

export async function updateTutorialGuideAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const current = await prisma.tutorialGuide.findUnique({ where: { id } });
  if (!current) throw new Error("Guia não encontrado.");

  // Slug nunca muda numa edição — trocar o título não pode quebrar a URL pública
  // /tutorial/[slug] nem um link já compartilhado.
  const data = guideDataFromForm(formData);
  if (!data.title) throw new Error("Título é obrigatório.");
  await prisma.tutorialGuide.update({ where: { id }, data });
  await logAdminAction(admin, { action: "update", entity: "TutorialGuide", entityId: id, summary: data.title });
  revalidatePath("/admin/tutorial");
  revalidatePath(`/admin/tutorial/${id}`);
  revalidatePath("/tutorial");
  revalidatePath(`/tutorial/${current.slug}`);
}

export async function deleteTutorialGuideAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const guide = await prisma.tutorialGuide.delete({ where: { id } }).catch(() => null);
  if (!guide) return;
  await logAdminAction(admin, { action: "delete", entity: "TutorialGuide", entityId: id, summary: guide.title });
  revalidatePath("/admin/tutorial");
  revalidatePath("/tutorial");
  revalidatePath(`/tutorial/${guide.slug}`);
}

function stepDataFromForm(formData: FormData) {
  return {
    order: Number(formData.get("order") ?? 0) || 0,
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    imageUrl: optionalString(formData, "imageUrl"),
    imageAlt: optionalString(formData, "imageAlt")
  };
}

export async function createTutorialStepAction(formData: FormData) {
  const admin = await requireAdmin();
  const guideId = String(formData.get("guideId") ?? "");
  const guideSlug = String(formData.get("guideSlug") ?? "");
  const data = stepDataFromForm(formData);
  if (!data.title || !data.body) throw new Error("Título e corpo são obrigatórios.");
  if (data.imageUrl && !data.imageAlt) throw new Error("Descreva a imagem (texto alternativo) quando informar uma imagem.");

  const step = await prisma.tutorialStep.create({ data: { ...data, guideId } });
  await logAdminAction(admin, { action: "create", entity: "TutorialStep", entityId: step.id, summary: `${guideSlug}: ${data.title}` });
  revalidatePath(`/admin/tutorial/${guideId}`);
  if (guideSlug) revalidatePath(`/tutorial/${guideSlug}`);
}

export async function updateTutorialStepAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const guideSlug = String(formData.get("guideSlug") ?? "");
  const current = await prisma.tutorialStep.findUnique({ where: { id } });
  if (!current) throw new Error("Passo não encontrado.");

  const data = stepDataFromForm(formData);
  if (!data.title || !data.body) throw new Error("Título e corpo são obrigatórios.");
  if (data.imageUrl && !data.imageAlt) throw new Error("Descreva a imagem (texto alternativo) quando informar uma imagem.");

  await prisma.tutorialStep.update({ where: { id }, data });
  await logAdminAction(admin, { action: "update", entity: "TutorialStep", entityId: id, summary: `${guideSlug}: ${data.title}` });
  revalidatePath(`/admin/tutorial/${guideId}`);
  if (guideSlug) revalidatePath(`/tutorial/${guideSlug}`);
}

/**
 * `id` é o único campo que ConfirmDeleteButton sabe enviar (constrói o próprio FormData só com
 * isso) — por isso deriva guideId/guideSlug da própria linha em vez de exigi-los como campo
 * hidden à parte, diferente de create/update (que já têm o form completo disponível).
 */
export async function deleteTutorialStepAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const step = await prisma.tutorialStep.delete({ where: { id }, include: { guide: true } }).catch(() => null);
  if (!step) return;
  await logAdminAction(admin, { action: "delete", entity: "TutorialStep", entityId: id, summary: `${step.guide.slug}: ${step.title}` });
  revalidatePath(`/admin/tutorial/${step.guideId}`);
  revalidatePath(`/tutorial/${step.guide.slug}`);
}
