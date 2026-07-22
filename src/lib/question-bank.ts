import { Difficulty, Prisma, QuestionFormat, QuestionStatus, Role } from "@prisma/client";
import { getAppSettings } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/subscriptions";

/**
 * Banco público de questões: listagem/prática das questões APPROVED da
 * plataforma. Aberto também a usuários sem assinatura (trial) com limite
 * diário de respostas — isca de conversão sem custo de IA.
 */

export const BANK_PAGE_SIZE = 20;

export type BankFilters = {
  subjectId?: string;
  topicId?: string;
  difficulty?: Difficulty;
  format?: QuestionFormat;
  q?: string;
  page?: number;
};

/** Normaliza searchParams crus em filtros válidos (valores inválidos são descartados). */
export function parseBankFilters(params: Record<string, string | undefined>): BankFilters {
  const difficulty = Object.values(Difficulty).includes(params.difficulty as Difficulty)
    ? (params.difficulty as Difficulty)
    : undefined;
  const format = Object.values(QuestionFormat).includes(params.format as QuestionFormat)
    ? (params.format as QuestionFormat)
    : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  return {
    subjectId: params.subjectId || undefined,
    topicId: params.topicId || undefined,
    difficulty,
    format,
    q: params.q?.trim().slice(0, 200) || undefined,
    page
  };
}

/** Query string dos filtros (para paginação e link de prática preservarem o estado). */
export function bankFiltersToQuery(filters: BankFilters, overrides: Partial<BankFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.subjectId) params.set("subjectId", merged.subjectId);
  if (merged.topicId) params.set("topicId", merged.topicId);
  if (merged.difficulty) params.set("difficulty", merged.difficulty);
  if (merged.format) params.set("format", merged.format);
  if (merged.q) params.set("q", merged.q);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

function bankWhere(filters: BankFilters): Prisma.QuestionWhereInput {
  return {
    status: QuestionStatus.APPROVED,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.topicId ? { topicId: filters.topicId } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(filters.q ? { statement: { contains: filters.q, mode: "insensitive" as const } } : {})
  };
}

export async function listBankQuestions(filters: BankFilters) {
  const page = filters.page ?? 1;
  const where = bankWhere(filters);
  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        topic: { select: { name: true } },
        options: { orderBy: { order: "asc" } },
        sourceReferenceQuestion: {
          select: { document: { select: { title: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * BANK_PAGE_SIZE,
      take: BANK_PAGE_SIZE
    })
  ]);
  return {
    questions,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / BANK_PAGE_SIZE))
  };
}

/** Selo de confiança da questão (exibido na lista e no runner). */
export function buildSourceBadge(question: {
  sourceReferenceQuestion?: { document: { title: string } } | null;
  reviewedById?: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (question.sourceReferenceQuestion) {
    parts.push(`Baseada em prova real · ${question.sourceReferenceQuestion.document.title}`);
  }
  if (question.reviewedById) {
    parts.push("Revisada pela equipe");
  }
  return parts.length ? parts.join(" · ") : undefined;
}

export type TrialBankStatus = {
  /** true = usuário sem assinatura (e não-admin): limite diário se aplica. */
  isTrial: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
};

/**
 * Respostas de HOJE em questões da plataforma (exclui simulados, que têm fluxo
 * próprio, e questões criadas pelo próprio usuário — os sets de IA dele já são
 * limitados pelo trial de geração). Meia-noite do servidor "reseta" sozinha,
 * mesmo corte do limite diário de IA.
 */
function bankAnswersTodayWhere(userId: string): Prisma.QuestionAttemptWhereInput {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return {
    userId,
    createdAt: { gte: todayStart },
    mockExamSessionId: null,
    question: { OR: [{ createdById: null }, { createdById: { not: userId } }] }
  };
}

export async function getTrialBankStatus(user: { id: string; role?: Role }): Promise<TrialBankStatus> {
  if (user.role === Role.ADMIN) return { isTrial: false, limit: null, used: 0, remaining: null };
  const subscription = await getActiveSubscription(user.id);
  if (subscription) return { isTrial: false, limit: null, used: 0, remaining: null };

  const [settings, used] = await Promise.all([
    getAppSettings(),
    prisma.questionAttempt.count({ where: bankAnswersTodayWhere(user.id) })
  ]);
  const limit = Math.max(0, settings.bankDailyAnswersLimitTrial);
  return { isTrial: true, limit, used, remaining: Math.max(0, limit - used) };
}
