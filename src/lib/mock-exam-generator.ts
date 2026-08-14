import { Difficulty, MockExamStatus, Prisma, QuestionFormat, QuestionSetMode, QuestionStatus, Role } from "@prisma/client";
import { dayKeyInBrazil, dayKeyToInstant, formatDateBR, shiftDayKey, startOfWeekInBrazil } from "@/lib/dates";
import { finalizeMockExamSession } from "@/lib/mock-exams";
import { prisma } from "@/lib/prisma";
import { shuffle } from "@/lib/reference";

/**
 * Simulado semanal auto-gerado: reaproveita questões já existentes no banco (de
 * qualquer usuário) em vez de gastar IA gerando do zero — várias matérias na mesma
 * prova, proporcional ao que cada matéria tem disponível. Chamado pelo cron em
 * src/app/api/cron/generate-weekly-mock-exam/route.ts, idempotente por semana
 * (weekKey), então é seguro chamar mais vezes do que uma por semana.
 *
 * MockExamAnswer.userAnswer só guarda CERTO/ERRADO (ver schema.prisma) e o
 * MockExamRunner só sabe responder essas duas opções — por isso o algoritmo só
 * seleciona questões QuestionFormat.CERTO_ERRADO. Múltipla escolha em simulado
 * exigiria mudar a infra de sessão/resposta, fora de escopo aqui.
 */

export const WEEKLY_MOCK_EXAM_TOTAL_QUESTIONS = 45;
export const WEEKLY_MOCK_EXAM_DURATION_MINUTES = 180;
// Abaixo disso a matéria fica de fora dessa semana em vez de forçar poucas questões.
const MIN_ELIGIBLE_QUESTIONS_PER_SUBJECT = 5;

export type WeeklyMockExamResult =
  | { created: true; mockExamId: string; weekKey: string; totalQuestions: number; subjectCount: number }
  | { created: false; weekKey: string; reason: "already-exists" | "no-eligible-content" };

type ClonableQuestion = {
  id: string;
  subjectId: string;
  topicId: string;
  format: QuestionFormat;
  statement: string;
  supportText: string | null;
  answer: "CERTO" | "ERRADO" | null;
  explanation: string;
  difficulty: Difficulty;
  sourceType: "AI" | "MANUAL";
  aiModel: string | null;
  sourceReferenceQuestionId: string | null;
};

const CLONE_SELECT = {
  id: true,
  subjectId: true,
  topicId: true,
  format: true,
  statement: true,
  supportText: true,
  answer: true,
  explanation: true,
  difficulty: true,
  sourceType: true,
  aiModel: true,
  sourceReferenceQuestionId: true
} satisfies Prisma.QuestionSelect;

export async function generateWeeklyMockExamIfNeeded(reference: Date = new Date()): Promise<WeeklyMockExamResult> {
  const weekStart = startOfWeekInBrazil(reference);
  const weekKey = dayKeyInBrazil(weekStart);

  const existing = await prisma.mockExam.findUnique({ where: { weekKey }, select: { id: true } });
  if (existing) return { created: false, weekKey, reason: "already-exists" };

  const allocations = await buildSubjectAllocations(WEEKLY_MOCK_EXAM_TOTAL_QUESTIONS);
  if (allocations.length === 0) return { created: false, weekKey, reason: "no-eligible-content" };

  const selectedBySubject = await Promise.all(
    allocations.map(async (allocation) => ({
      subjectId: allocation.subjectId,
      questions: await selectQuestionsForSubject(allocation.subjectId, allocation.count)
    }))
  );

  const allSelected = selectedBySubject.flatMap((entry) => entry.questions);
  if (allSelected.length === 0) return { created: false, weekKey, reason: "no-eligible-content" };

  // Matéria "embrulho" do QuestionSet (exigida pelo schema, nunca exibida — ver
  // examSubjectLabel em mock-exams.ts): a que mais contribuiu questões, desempate por id.
  const subjectContribution = selectedBySubject
    .map((entry) => ({ subjectId: entry.subjectId, count: entry.questions.length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId));
  const wrapperSubjectId = subjectContribution[0].subjectId;
  const wrapperTopicId = selectedBySubject.find((entry) => entry.subjectId === wrapperSubjectId)!.questions[0].topicId;

  const ownerId = await getSystemOwnerUserId();
  const closesAt = dayKeyToInstant(shiftDayKey(weekKey, 7));
  const title = `Simulado da semana de ${formatDateBR(weekStart)}`;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const questionSet = await tx.questionSet.create({
        data: {
          userId: ownerId,
          subjectId: wrapperSubjectId,
          topicId: wrapperTopicId,
          title,
          prompt: "Simulado semanal gerado automaticamente a partir do banco de questões da plataforma.",
          mode: QuestionSetMode.SIMULADO,
          format: QuestionFormat.CERTO_ERRADO,
          difficulty: Difficulty.MEDIO,
          quantity: allSelected.length,
          questions: {
            create: allSelected.map((question, index) => ({
              subjectId: question.subjectId,
              topicId: question.topicId,
              orderInSet: index + 1,
              format: question.format,
              statement: question.statement,
              supportText: question.supportText,
              answer: question.answer,
              explanation: question.explanation,
              difficulty: question.difficulty,
              // Mesmo status-padrão de toda questão recém-gerada (ver generateAndSaveQuestionSet
              // em question-sets.ts) — não some no banco público /questoes, que só lista APPROVED.
              status: QuestionStatus.DRAFT,
              sourceType: question.sourceType,
              aiModel: question.aiModel,
              ...(question.sourceReferenceQuestionId
                ? { sourceReferenceQuestion: { connect: { id: question.sourceReferenceQuestionId } } }
                : {})
            }))
          }
        }
      });

      return tx.mockExam.create({
        data: {
          title,
          questionSetId: questionSet.id,
          durationMinutes: WEEKLY_MOCK_EXAM_DURATION_MINUTES,
          opensAt: weekStart,
          closesAt,
          status: MockExamStatus.PUBLISHED,
          createdById: ownerId,
          isAutoGenerated: true,
          weekKey,
          subjectCount: subjectContribution.length
        }
      });
    });
  } catch (error) {
    // Corrida: outro disparo do cron criou essa semana entre o findUnique e o commit —
    // idempotência via weekKey único (o transaction inteiro desfaz o clone, sem sobra).
    const isDuplicateWeek = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isDuplicateWeek) throw error;
    return { created: false, weekKey, reason: "already-exists" };
  }

  await closeStaleAutoExams(weekKey);

  return {
    created: true,
    mockExamId: created.id,
    weekKey,
    totalQuestions: allSelected.length,
    subjectCount: subjectContribution.length
  };
}

/** Quantas questões pedir de cada matéria: divide o alvo entre matérias elegíveis e
 *  redistribui em round-robin o que sobrar pras que ainda têm espaço, respeitando o
 *  tamanho real do banco de cada uma (nunca aloca mais do que a matéria tem). */
async function buildSubjectAllocations(totalTarget: number): Promise<{ subjectId: string; count: number }[]> {
  const counts = await prisma.question.groupBy({
    by: ["subjectId"],
    where: { format: QuestionFormat.CERTO_ERRADO, status: { not: QuestionStatus.REJECTED } },
    _count: { _all: true }
  });
  const eligible = counts.filter((entry) => entry._count._all >= MIN_ELIGIBLE_QUESTIONS_PER_SUBJECT);
  if (eligible.length === 0) return [];

  const base = Math.floor(totalTarget / eligible.length);
  const allocations = new Map<string, number>(eligible.map((entry) => [entry.subjectId, Math.min(base, entry._count._all)]));
  let remaining = totalTarget - [...allocations.values()].reduce((sum, count) => sum + count, 0);

  let madeProgress = true;
  while (remaining > 0 && madeProgress) {
    madeProgress = false;
    for (const entry of eligible) {
      if (remaining <= 0) break;
      const current = allocations.get(entry.subjectId) ?? 0;
      if (current < entry._count._all) {
        allocations.set(entry.subjectId, current + 1);
        remaining -= 1;
        madeProgress = true;
      }
    }
  }

  return [...allocations.entries()].filter(([, count]) => count > 0).map(([subjectId, count]) => ({ subjectId, count }));
}

/** Prioriza APPROVED (revisadas pela equipe); completa com qualquer outra questão
 *  da matéria (PENDING_REVIEW ou DRAFT — nunca REJECTED) quando faltar volume. */
async function selectQuestionsForSubject(subjectId: string, count: number): Promise<ClonableQuestion[]> {
  const approved = await prisma.question.findMany({
    where: { subjectId, format: QuestionFormat.CERTO_ERRADO, status: QuestionStatus.APPROVED },
    select: CLONE_SELECT
  });
  const picked = shuffle(approved).slice(0, count);

  if (picked.length < count) {
    const fallback = await prisma.question.findMany({
      where: {
        subjectId,
        format: QuestionFormat.CERTO_ERRADO,
        status: { in: [QuestionStatus.PENDING_REVIEW, QuestionStatus.DRAFT] }
      },
      select: CLONE_SELECT
    });
    picked.push(...shuffle(fallback).slice(0, count - picked.length));
  }

  return picked;
}

/** Mesmo dono técnico que o admin já usa ao criar um simulado manualmente
 *  (ver admin/simulados/actions.ts) — o admin ativo mais antigo. */
async function getSystemOwnerUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isBlocked: false },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  if (!admin) throw new Error("Nenhum admin ativo encontrado para atribuir o simulado automático.");
  return admin.id;
}

/** Fecha simulados automáticos de semanas anteriores ainda abertos — mesmo laço que
 *  closeMockExamAction (admin/simulados/actions.ts) já faz no botão "Encerrar": finaliza
 *  sessões em andamento antes de marcar CLOSED, senão ficariam acumulando na listagem. */
async function closeStaleAutoExams(currentWeekKey: string): Promise<void> {
  const stale = await prisma.mockExam.findMany({
    where: { isAutoGenerated: true, status: MockExamStatus.PUBLISHED, weekKey: { not: currentWeekKey } },
    select: { id: true }
  });
  for (const exam of stale) {
    const openSessions = await prisma.mockExamSession.findMany({
      where: { mockExamId: exam.id, finishedAt: null },
      select: { id: true }
    });
    for (const session of openSessions) {
      await finalizeMockExamSession(session.id);
    }
    await prisma.mockExam.update({ where: { id: exam.id }, data: { status: MockExamStatus.CLOSED } });
  }
}
