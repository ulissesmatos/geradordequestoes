import { AiChatRole, AiUsageEventStatus, Role, UsageKind, UsageMeter } from "@prisma/client";
import { dayKeyInBrazil, dayKeyToInstant, shiftDayKey, startOfDayInBrazil, startOfMonthInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { resolveLimits, type MeterLimits, type ResolvedLimits } from "@/lib/usage/ledger";

/**
 * Relatório de consumo por usuário, para o painel admin.
 *
 * Vive separado de ledger.ts porque responde a outra pergunta. ledger.ts decide se a PRÓXIMA
 * ação passa, e por isso só olha o medidor que está travando; aqui o admin quer o quadro
 * inteiro — as duas janelas, os dois medidores, o que foi estornado e em que tipo de ação o
 * consumo aconteceu.
 *
 * O ponto que faz este arquivo existir: ele funciona EM MODO SOMBRA. As linhas do livro-caixa
 * são gravadas mesmo com o enforcement desligado (ver reserveUsage), então dá para medir o
 * consumo real de cada pessoa antes de qualquer cota bloquear alguém — que é exatamente a
 * calibragem que o modo sombra existe para permitir.
 */

/** Janela do gráfico/tabela diária. 30 dias cobre um ciclo mensal inteiro com folga. */
const DAILY_WINDOW_DAYS = 30;

export type UsageBuckets = {
  today: number;
  /** Ciclo de cota vigente (mês calendário no trial, aniversário no assinante). */
  cycle: number;
  /** Mês calendário — útil quando o ciclo é por aniversário e as duas contas divergem. */
  month: number;
  last30: number;
  total: number;
};

export type KindBreakdown = { kind: UsageKind; units: number; events: number };

export type MeterReport = {
  meter: UsageMeter;
  limits: MeterLimits;
  buckets: UsageBuckets;
  /** Unidades estornadas (linhas com refundedAt). Fora dos buckets, mas o admin precisa ver. */
  refunded: number;
  byKind: KindBreakdown[];
  /** 0-100 do teto do ciclo. null = sem teto. */
  percentCycle: number | null;
  /** 0-100 do teto diário. null = sem teto. */
  percentToday: number | null;
};

export type DailyUsagePoint = { day: string; questions: number; chat: number };

export type AiCostReport = {
  events: number;
  eventsToday: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type UserUsageReport = {
  limits: ResolvedLimits;
  questions: MeterReport;
  chat: MeterReport;
  daily: DailyUsagePoint[];
  ai: AiCostReport;
  /** Contador legado (AiUsageEvent/dia), que é quem ainda bloqueia em modo sombra. */
  legacyGenerationsToday: number;
  /** Livro-caixa legado do trial, no mês calendário. */
  legacyTrialMonth: number;
};

const EMPTY_SUMS: Record<UsageMeter, number> = { [UsageMeter.QUESTIONS]: 0, [UsageMeter.CHAT]: 0 };

function percentOf(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Soma por medidor numa janela. `since` ausente = desde sempre. */
async function sumsByMeter(userId: string, since?: Date): Promise<Record<UsageMeter, number>> {
  const rows = await prisma.usageLedger.groupBy({
    by: ["meter"],
    where: { userId, refundedAt: null, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { costUnits: true }
  });
  const totals = { ...EMPTY_SUMS };
  for (const row of rows) totals[row.meter] = row._sum.costUnits ?? 0;
  return totals;
}

async function refundedByMeter(userId: string): Promise<Record<UsageMeter, number>> {
  const rows = await prisma.usageLedger.groupBy({
    by: ["meter"],
    where: { userId, refundedAt: { not: null } },
    _sum: { costUnits: true }
  });
  const totals = { ...EMPTY_SUMS };
  for (const row of rows) totals[row.meter] = row._sum.costUnits ?? 0;
  return totals;
}

async function breakdownByKind(userId: string): Promise<Record<UsageMeter, KindBreakdown[]>> {
  const rows = await prisma.usageLedger.groupBy({
    by: ["meter", "kind"],
    where: { userId, refundedAt: null },
    _sum: { costUnits: true },
    _count: { _all: true }
  });
  const byMeter: Record<UsageMeter, KindBreakdown[]> = { [UsageMeter.QUESTIONS]: [], [UsageMeter.CHAT]: [] };
  for (const row of rows) {
    byMeter[row.meter].push({ kind: row.kind, units: row._sum.costUnits ?? 0, events: row._count._all });
  }
  for (const list of Object.values(byMeter)) list.sort((a, b) => b.units - a.units);
  return byMeter;
}

/**
 * Série diária dos últimos 30 dias, com os dias vazios preenchidos.
 *
 * Agrupa em JS em vez de SQL de propósito: o corte do dia é o de Brasília (ver dates.ts), e
 * `date_trunc` no Postgres cortaria em UTC — o consumo das 21h em diante cairia no dia
 * seguinte, deslocando toda a série em relação ao que o resto do app chama de "hoje".
 */
async function dailySeries(userId: string): Promise<DailyUsagePoint[]> {
  const today = dayKeyInBrazil();
  const keys: string[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) keys.push(shiftDayKey(today, -i));

  const rows = await prisma.usageLedger.findMany({
    where: { userId, refundedAt: null, createdAt: { gte: dayKeyToInstant(keys[0]) } },
    select: { meter: true, costUnits: true, createdAt: true }
  });

  const index = new Map<string, DailyUsagePoint>(keys.map((day) => [day, { day, questions: 0, chat: 0 }]));
  for (const row of rows) {
    const point = index.get(dayKeyInBrazil(row.createdAt));
    if (!point) continue;
    if (row.meter === UsageMeter.QUESTIONS) point.questions += row.costUnits;
    else point.chat += row.costUnits;
  }
  return keys.map((day) => index.get(day)!);
}

export async function getUserUsageReport(user: { id: string; role?: Role }): Promise<UserUsageReport> {
  const limits = await resolveLimits(user);
  const dayStart = startOfDayInBrazil();
  const monthStart = startOfMonthInBrazil();
  const last30Start = dayKeyToInstant(shiftDayKey(dayKeyInBrazil(), -(DAILY_WINDOW_DAYS - 1)));

  const [today, cycle, month, last30, total, refunded, byKind, daily, aiAgg, aiToday, aiErrors, trialMonth] =
    await Promise.all([
      sumsByMeter(user.id, dayStart),
      sumsByMeter(user.id, limits.period.start),
      sumsByMeter(user.id, monthStart),
      sumsByMeter(user.id, last30Start),
      sumsByMeter(user.id),
      refundedByMeter(user.id),
      breakdownByKind(user.id),
      dailySeries(user.id),
      prisma.aiUsageEvent.aggregate({
        where: { userId: user.id },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true }
      }),
      prisma.aiUsageEvent.count({
        where: { userId: user.id, status: AiUsageEventStatus.SUCCESS, createdAt: { gte: dayStart } }
      }),
      prisma.aiUsageEvent.count({ where: { userId: user.id, status: { not: AiUsageEventStatus.SUCCESS } } }),
      prisma.trialUsageEvent.count({ where: { userId: user.id, createdAt: { gte: monthStart } } })
    ]);

  const buildMeter = (meter: UsageMeter, meterLimits: MeterLimits): MeterReport => {
    const buckets: UsageBuckets = {
      today: today[meter],
      cycle: cycle[meter],
      month: month[meter],
      last30: last30[meter],
      total: total[meter]
    };
    return {
      meter,
      limits: meterLimits,
      buckets,
      refunded: refunded[meter],
      byKind: byKind[meter],
      percentCycle: percentOf(buckets.cycle, meterLimits.perMonth),
      percentToday: percentOf(buckets.today, meterLimits.perDay)
    };
  };

  return {
    limits,
    questions: buildMeter(UsageMeter.QUESTIONS, limits.questions),
    chat: buildMeter(UsageMeter.CHAT, limits.chat),
    daily,
    ai: {
      events: aiAgg._count._all,
      eventsToday: aiToday,
      errors: aiErrors,
      inputTokens: aiAgg._sum.inputTokens ?? 0,
      outputTokens: aiAgg._sum.outputTokens ?? 0,
      costUsd: Number(aiAgg._sum.costUsd ?? 0)
    },
    legacyGenerationsToday: aiToday,
    legacyTrialMonth: trialMonth
  };
}

export type UserUsageTotals = { questionsMonth: number; questionsTotal: number; chatMonth: number };

/**
 * Consumo de uma PÁGINA de usuários, em duas consultas.
 *
 * A lista do admin mostra 25 usuários; chamar getUserUsageReport por linha seriam ~300
 * consultas. Aqui um groupBy por userId resolve a coluna inteira de uma vez.
 */
export async function getUsersUsageTotals(userIds: string[]): Promise<Map<string, UserUsageTotals>> {
  const result = new Map<string, UserUsageTotals>();
  if (userIds.length === 0) return result;

  const [monthRows, totalRows] = await Promise.all([
    prisma.usageLedger.groupBy({
      by: ["userId", "meter"],
      where: { userId: { in: userIds }, refundedAt: null, createdAt: { gte: startOfMonthInBrazil() } },
      _sum: { costUnits: true }
    }),
    prisma.usageLedger.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, refundedAt: null, meter: UsageMeter.QUESTIONS },
      _sum: { costUnits: true }
    })
  ]);

  const ensure = (userId: string) => {
    const current = result.get(userId) ?? { questionsMonth: 0, questionsTotal: 0, chatMonth: 0 };
    result.set(userId, current);
    return current;
  };

  for (const row of monthRows) {
    const entry = ensure(row.userId);
    if (row.meter === UsageMeter.QUESTIONS) entry.questionsMonth = row._sum.costUnits ?? 0;
    else entry.chatMonth = row._sum.costUnits ?? 0;
  }
  for (const row of totalRows) {
    ensure(row.userId).questionsTotal = row._sum.costUnits ?? 0;
  }

  return result;
}

export type UserChatOverview = {
  sessions: number;
  messages: number;
  /** Mensagens do usuário — é o que o medidor CHAT cobra (uma unidade por ação de entrada). */
  userMessages: number;
  assistantMessages: number;
  attachments: number;
  /** Blocos de questões nascidos dentro do chat, e quantas questões vieram deles. */
  questionSets: number;
  questionsFromChat: number;
  materials: number;
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
};

export async function getUserChatOverview(userId: string): Promise<UserChatOverview> {
  const [sessions, byRole, attachments, sets, materials, bounds] = await Promise.all([
    prisma.aiChatSession.count({ where: { userId } }),
    prisma.aiChatMessage.groupBy({ by: ["role"], where: { session: { userId } }, _count: { _all: true } }),
    prisma.aiChatMessageAttachment.count({ where: { message: { session: { userId } } } }),
    prisma.questionSet.aggregate({
      where: { userId, chatSessionId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true }
    }),
    prisma.aiChatMessage.findMany({
      where: { session: { userId }, studyMaterialId: { not: null } },
      select: { studyMaterialId: true },
      distinct: ["studyMaterialId"]
    }),
    prisma.aiChatMessage.aggregate({
      where: { session: { userId } },
      _min: { createdAt: true },
      _max: { createdAt: true }
    })
  ]);

  const count = (role: AiChatRole) => byRole.find((row) => row.role === role)?._count._all ?? 0;
  const messages = byRole.reduce((sum, row) => sum + row._count._all, 0);

  return {
    sessions,
    messages,
    userMessages: count(AiChatRole.USER),
    assistantMessages: count(AiChatRole.ASSISTANT),
    attachments,
    questionSets: sets._count._all,
    questionsFromChat: sets._sum.quantity ?? 0,
    materials: materials.length,
    firstMessageAt: bounds._min.createdAt ?? null,
    lastMessageAt: bounds._max.createdAt ?? null
  };
}
