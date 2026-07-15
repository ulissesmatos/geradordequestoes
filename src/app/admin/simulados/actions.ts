"use server";

import { Difficulty, MockExamStatus, QuestionFormat, QuestionSetMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidModelId } from "@/lib/ai/model-catalog";
import { logAdminAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { finalizeMockExamSession } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { generateAndSaveQuestionSet } from "@/lib/question-sets";

export type MockExamActionState = { ok?: boolean; error?: string } | null;

const createSchema = z.object({
  title: z.string().min(3, "Informe um título."),
  description: z.string().optional(),
  subjectId: z.string().min(1, "Escolha a matéria."),
  topicId: z.string().min(1, "Escolha o assunto."),
  difficulty: z.nativeEnum(Difficulty),
  quantity: z.coerce.number().int().min(5).max(120),
  prompt: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(360),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  teamAccountId: z.string().optional(),
  model: z.string().optional()
});

export async function createMockExamAction(_: MockExamActionState, formData: FormData): Promise<MockExamActionState> {
  const admin = await requireAdmin();

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subjectId: formData.get("subjectId"),
    topicId: formData.get("topicId"),
    difficulty: formData.get("difficulty"),
    quantity: formData.get("quantity"),
    prompt: formData.get("prompt") || undefined,
    durationMinutes: formData.get("durationMinutes"),
    opensAt: formData.get("opensAt") || undefined,
    closesAt: formData.get("closesAt") || undefined,
    teamAccountId: formData.get("teamAccountId") || undefined,
    model: formData.get("model") || undefined
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const modelOverride = data.model?.trim() || undefined;
  if (modelOverride && !isValidModelId(modelOverride)) {
    return { error: "ID de modelo inválido. Use apenas letras, números, pontos, hífens e barras." };
  }

  const opensAt = data.opensAt ? new Date(data.opensAt) : null;
  const closesAt = data.closesAt ? new Date(data.closesAt) : null;
  if (opensAt && Number.isNaN(opensAt.getTime())) return { error: "Data de abertura inválida." };
  if (closesAt && Number.isNaN(closesAt.getTime())) return { error: "Data de fechamento inválida." };
  if (opensAt && closesAt && closesAt <= opensAt) return { error: "O fechamento deve ser depois da abertura." };

  let examId: string;
  try {
    const questionSet = await generateAndSaveQuestionSet({
      user: admin,
      subjectId: data.subjectId,
      topicId: data.topicId,
      difficulty: data.difficulty,
      quantity: data.quantity,
      format: QuestionFormat.CERTO_ERRADO,
      mode: QuestionSetMode.SIMULADO,
      title: data.title,
      prompt: data.prompt || `Simulado oficial: ${data.title}`,
      modelOverride
    });

    const exam = await prisma.mockExam.create({
      data: {
        title: data.title,
        description: data.description,
        questionSetId: questionSet.id,
        teamAccountId: data.teamAccountId || null,
        durationMinutes: data.durationMinutes,
        opensAt,
        closesAt,
        createdById: admin.id
      }
    });
    examId = exam.id;

    await logAdminAction(admin, {
      action: "create",
      entity: "MockExam",
      entityId: exam.id,
      summary: `Simulado "${data.title}" (${data.quantity} questões, ${data.durationMinutes} min${modelOverride ? `, modelo ${modelOverride}` : ""})`
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao gerar o simulado." };
  }

  revalidatePath("/admin/simulados");
  redirect(`/admin/simulados/${examId}`);
}

async function getExamOrThrow(id: string) {
  const exam = await prisma.mockExam.findUnique({ where: { id }, select: { id: true, title: true, status: true } });
  if (!exam) throw new Error("Simulado não encontrado.");
  return exam;
}

export async function publishMockExamAction(id: string) {
  const admin = await requireAdmin();
  const exam = await getExamOrThrow(id);
  if (exam.status !== MockExamStatus.DRAFT) throw new Error("Só rascunhos podem ser publicados.");

  await prisma.mockExam.update({ where: { id }, data: { status: MockExamStatus.PUBLISHED } });
  await logAdminAction(admin, { action: "publish", entity: "MockExam", entityId: id, summary: exam.title });
  revalidatePath("/admin/simulados");
  revalidatePath(`/admin/simulados/${id}`);
  revalidatePath("/simulados");
}

export async function closeMockExamAction(id: string) {
  const admin = await requireAdmin();
  const exam = await getExamOrThrow(id);

  // Fechar também finaliza (e corrige) as sessões ainda abertas.
  const openSessions = await prisma.mockExamSession.findMany({
    where: { mockExamId: id, finishedAt: null },
    select: { id: true }
  });
  for (const session of openSessions) {
    await finalizeMockExamSession(session.id);
  }

  await prisma.mockExam.update({ where: { id }, data: { status: MockExamStatus.CLOSED } });
  await logAdminAction(admin, {
    action: "close",
    entity: "MockExam",
    entityId: id,
    summary: `${exam.title} (${openSessions.length} sessões abertas finalizadas)`
  });
  revalidatePath("/admin/simulados");
  revalidatePath(`/admin/simulados/${id}`);
  revalidatePath("/simulados");
}

export async function archiveMockExamAction(id: string) {
  const admin = await requireAdmin();
  const exam = await getExamOrThrow(id);
  await prisma.mockExam.update({ where: { id }, data: { status: MockExamStatus.ARCHIVED } });
  await logAdminAction(admin, { action: "archive", entity: "MockExam", entityId: id, summary: exam.title });
  revalidatePath("/admin/simulados");
  revalidatePath(`/admin/simulados/${id}`);
  revalidatePath("/simulados");
}

export async function deleteMockExamAction(id: string) {
  const admin = await requireAdmin();
  const exam = await prisma.mockExam.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, _count: { select: { sessions: true } } }
  });
  if (!exam) throw new Error("Simulado não encontrado.");
  if (exam.status !== MockExamStatus.DRAFT || exam._count.sessions > 0) {
    throw new Error("Só rascunhos sem participações podem ser excluídos.");
  }

  await prisma.mockExam.delete({ where: { id } });
  await logAdminAction(admin, { action: "delete", entity: "MockExam", entityId: id, summary: exam.title });
  revalidatePath("/admin/simulados");
  redirect("/admin/simulados");
}
