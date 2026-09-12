import { Role, UsageKind, UsageMeter } from "@prisma/client";
import { getAppSettings } from "@/lib/app-settings";
import { startOfDayInBrazil, startOfNextDayInBrazil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { QUESTION_LIMITS } from "@/lib/question-limits";
import { getActiveSubscription } from "@/lib/subscriptions";
import { resolveUsagePeriod, type UsagePeriod } from "@/lib/usage/period";

/**
 * Livro-caixa de consumo: reserva antes, acerta depois.
 *
 * Duas decisões que valem explicação, porque são o que faz este arquivo existir:
 *
 * 1. RESERVA E ACERTO. O número real de questões só se conhece DEPOIS da chamada — o modelo
 *    às vezes devolve um item a menos. Cobrar no fim, porém, reabriria a corrida que o
 *    livro-caixa do trial já documentava: com o rate limit de 10/min, dez pedidos paralelos
 *    leriam o saldo ainda zerado e passariam todos. Então reservamos o pedido inteiro na
 *    entrada e ajustamos para baixo quando o resultado chega.
 *
 * 2. INSERT-THEN-CHECK. Ler o saldo e só então inserir é TOCTOU. Aqui a linha entra primeiro
 *    e a soma é feita JÁ CONTANDO a própria linha; se estourou, estorna e recusa. O pior caso
 *    passa a ser um bloco além do teto, em vez de dez.
 */

export class UsageLimitError extends Error {
  constructor(
    message: string,
    readonly meter: UsageMeter,
    readonly scope: "day" | "month"
  ) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export type MeterLimits = {
  /** null = ilimitado. */
  perMonth: number | null;
  perDay: number | null;
};

export type ResolvedLimits = {
  kind: "ADMIN" | "PAID" | "TRIAL";
  questions: MeterLimits;
  chat: MeterLimits;
  /** Teto de questões por bloco gerado. null = sem teto. */
  maxQuestionsPerGeneration: number | null;
  period: UsagePeriod;
  subscriptionId: string | null;
  planId: string | null;
  /** false = modo sombra: mede e mostra, mas não bloqueia. */
  enforcement: boolean;
};

const UNLIMITED: MeterLimits = { perMonth: null, perDay: null };

/** Lê um inteiro positivo do JSON de override; qualquer outra coisa devolve undefined. */
function overrideInt(raw: unknown, key: string): number | null | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = (raw as Record<string, unknown>)[key];
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  return undefined;
}

export async function resolveLimits(user: { id: string; role?: Role }): Promise<ResolvedLimits> {
  const settings = await getAppSettings();
  const enforcement = settings.usageEnforcementEnabled;

  if (user.role === Role.ADMIN) {
    return {
      kind: "ADMIN",
      questions: UNLIMITED,
      chat: UNLIMITED,
      maxQuestionsPerGeneration: null,
      period: resolveUsagePeriod(null),
      subscriptionId: null,
      planId: null,
      enforcement
    };
  }

  const subscription = await getActiveSubscription(user.id);

  if (subscription) {
    const plan = subscription.plan;
    const override = subscription.limitsOverride;
    // Override do cliente vence o plano; ausente cai no plano. Serve para quem já consumia
    // acima de um teto novo manter o que tinha, sem precisar de um plano só para ele.
    const pick = (key: string, planValue: number | null) => {
      const fromOverride = overrideInt(override, key);
      return fromOverride === undefined ? planValue : fromOverride;
    };

    return {
      kind: "PAID",
      questions: {
        perMonth: pick("questionsPerMonth", plan.questionsPerMonth),
        perDay: pick("questionsPerDay", plan.questionsPerDay)
      },
      chat: { perMonth: null, perDay: pick("chatMessagesPerDay", plan.chatMessagesPerDay) },
      maxQuestionsPerGeneration: pick("maxQuestionsPerGeneration", plan.maxQuestionsPerGeneration),
      period: resolveUsagePeriod(subscription),
      subscriptionId: subscription.id,
      planId: plan.id,
      enforcement
    };
  }

  // Trial. `trialGenerationsLimit` continua sendo a chave-mestra: em 0 o trial está desligado
  // e o app volta a exigir assinatura (ver getTrialStatus/requireActiveSubscription).
  return {
    kind: "TRIAL",
    questions: { perMonth: settings.trialQuestionsPerMonth, perDay: null },
    chat: { perMonth: settings.trialGenerationsLimit, perDay: null },
    maxQuestionsPerGeneration:
      settings.trialMaxQuestionsPerGeneration > 0 ? settings.trialMaxQuestionsPerGeneration : null,
    period: resolveUsagePeriod(null),
    subscriptionId: null,
    planId: null,
    enforcement
  };
}

async function sumUsage(userId: string, meter: UsageMeter, since: Date): Promise<number> {
  const result = await prisma.usageLedger.aggregate({
    where: { userId, meter, refundedAt: null, createdAt: { gte: since } },
    _sum: { costUnits: true }
  });
  return result._sum.costUnits ?? 0;
}

export type MeterStatus = {
  limits: MeterLimits;
  usedMonth: number;
  usedToday: number;
  /** Quanto ainda cabe considerando os dois tetos. null = ilimitado. */
  remaining: number | null;
  /** 0-100 do teto mais apertado — o que a barra da tela mostra. */
  percent: number;
  /** Quando o teto que está travando reseta (ISO). null = sem teto. */
  resetsAt: string | null;
};

function buildMeterStatus(limits: MeterLimits, usedMonth: number, usedToday: number, period: UsagePeriod): MeterStatus {
  const remainingMonth = limits.perMonth === null ? null : Math.max(0, limits.perMonth - usedMonth);
  const remainingDay = limits.perDay === null ? null : Math.max(0, limits.perDay - usedToday);

  const candidates = [remainingMonth, remainingDay].filter((value): value is number => value !== null);
  const remaining = candidates.length ? Math.min(...candidates) : null;

  const monthPercent = limits.perMonth ? (usedMonth / limits.perMonth) * 100 : 0;
  const dayPercent = limits.perDay ? (usedToday / limits.perDay) * 100 : 0;
  const percent = Math.min(100, Math.round(Math.max(monthPercent, dayPercent)));

  // Informa o reset do teto que está efetivamente travando: dizer "renova dia 1º" para quem
  // esbarrou na rajada diária mandaria a pessoa esperar 20 dias por engano.
  const dayIsBinding = remainingDay !== null && (remainingMonth === null || remainingDay <= remainingMonth);
  const resetsAt =
    remaining === null
      ? null
      : dayIsBinding
        ? startOfNextDayInBrazil().toISOString()
        : period.end.toISOString();

  return { limits, usedMonth, usedToday, remaining, percent, resetsAt };
}

export async function getMeterStatus(
  user: { id: string; role?: Role },
  meter: UsageMeter,
  limits?: ResolvedLimits
): Promise<MeterStatus> {
  const resolved = limits ?? (await resolveLimits(user));
  const meterLimits = meter === UsageMeter.QUESTIONS ? resolved.questions : resolved.chat;
  const [usedMonth, usedToday] = await Promise.all([
    sumUsage(user.id, meter, resolved.period.start),
    sumUsage(user.id, meter, startOfDayInBrazil())
  ]);
  return buildMeterStatus(meterLimits, usedMonth, usedToday, resolved.period);
}

export type UsageSummary = {
  kind: ResolvedLimits["kind"];
  enforcement: boolean;
  questions: MeterStatus;
  chat: MeterStatus;
  maxQuestionsPerGeneration: number | null;
  period: UsagePeriod;
};

export async function getUsageSummary(user: { id: string; role?: Role }): Promise<UsageSummary> {
  const limits = await resolveLimits(user);
  const [questions, chat] = await Promise.all([
    getMeterStatus(user, UsageMeter.QUESTIONS, limits),
    getMeterStatus(user, UsageMeter.CHAT, limits)
  ]);
  return {
    kind: limits.kind,
    enforcement: limits.enforcement,
    questions,
    chat,
    maxQuestionsPerGeneration: limits.maxQuestionsPerGeneration,
    period: limits.period
  };
}

export type HeadlineUsage = {
  used: number;
  limit: number | null;
  percent: number;
  resetsAt: string | null;
  isTrial: boolean;
};

/**
 * Achata os dois medidores (questões, chat) num único número para telas que só têm espaço
 * para uma barra — perfil, cabeçalho do chat, ficha do usuário no admin. Escolhe o medidor
 * mais apertado (maior percent) entre os que têm algum teto configurado; sem nenhum teto,
 * devolve `limit: null` (mesmo contrato que ADMIN, que nunca tem teto).
 *
 * Dentro do medidor escolhido, prefere o teto diário quando existe (é o que o card sempre
 * mostrou para assinante) e cai para o mensal quando só ele está configurado (caso do trial).
 */
export function deriveHeadlineUsage(summary: UsageSummary): HeadlineUsage {
  const isTrial = summary.kind === "TRIAL";
  if (summary.kind === "ADMIN") {
    return { used: 0, limit: null, percent: 0, resetsAt: null, isTrial: false };
  }

  const candidates = [summary.questions, summary.chat].filter(
    (meter) => meter.limits.perMonth !== null || meter.limits.perDay !== null
  );
  if (candidates.length === 0) {
    return { used: 0, limit: null, percent: 0, resetsAt: null, isTrial };
  }

  const tightest = candidates.reduce((a, b) => (b.percent > a.percent ? b : a));
  const limit = tightest.limits.perDay ?? tightest.limits.perMonth;
  const used = tightest.limits.perDay !== null ? tightest.usedToday : tightest.usedMonth;
  return { used, limit, percent: tightest.percent, resetsAt: tightest.resetsAt, isTrial };
}

/**
 * Degraus de aviso da cota.
 *
 * O único aviso que existia acendia em 80%, e chegava tarde demais: quem pede um bloco de 20
 * questões salta de 65% para 100% numa ação só, e o aviso aparece junto com o bloqueio — não
 * antes dele, que é o único momento em que serviria para alguma coisa. Com 50/75/90 o usuário
 * cruza pelo menos um degrau com margem para decidir se segura o ritmo ou faz upgrade.
 */
export const QUOTA_ALERT_STEPS = [50, 75, 90] as const;

export type QuotaAlertStep = (typeof QUOTA_ALERT_STEPS)[number] | 100;

/** Maior degrau já cruzado. null abaixo do primeiro — silêncio é o comportamento certo aí. */
export function quotaAlertStep(percent: number): QuotaAlertStep | null {
  if (percent >= 100) return 100;
  for (let i = QUOTA_ALERT_STEPS.length - 1; i >= 0; i -= 1) {
    if (percent >= QUOTA_ALERT_STEPS[i]) return QUOTA_ALERT_STEPS[i];
  }
  return null;
}

export type QuotaAlert = {
  step: QuotaAlertStep;
  meter: UsageMeter;
  scope: "day" | "month";
  percent: number;
  used: number;
  limit: number;
  /** ISO de quando este teto reseta. */
  resetsAt: string;
  kind: ResolvedLimits["kind"];
};

/**
 * O aviso que o usuário deve ver AGORA, ou null.
 *
 * Disputa os quatro tetos (questões mês/dia, chat mês/dia) e devolve o mais apertado. Mostrar
 * os quatro seria ruído: só um deles vai bloquear a próxima ação, e é sobre esse que a pessoa
 * precisa decidir.
 *
 * Em modo sombra devolve null sempre — avisar sobre uma cota que não bloqueia nada treinaria o
 * usuário a ignorar o aviso justamente antes de ele passar a valer.
 */
export function buildQuotaAlert(summary: UsageSummary): QuotaAlert | null {
  if (!summary.enforcement || summary.kind === "ADMIN") return null;

  const dayReset = startOfNextDayInBrazil().toISOString();
  const monthReset = summary.period.end.toISOString();

  const candidates: QuotaAlert[] = [];
  const consider = (meter: UsageMeter, scope: "day" | "month", used: number, limit: number | null) => {
    if (limit === null || limit <= 0) return;
    const percent = Math.min(100, Math.round((used / limit) * 100));
    const step = quotaAlertStep(percent);
    if (step === null) return;
    candidates.push({
      step,
      meter,
      scope,
      percent,
      used,
      limit,
      resetsAt: scope === "day" ? dayReset : monthReset,
      kind: summary.kind
    });
  };

  consider(UsageMeter.QUESTIONS, "month", summary.questions.usedMonth, summary.questions.limits.perMonth);
  consider(UsageMeter.QUESTIONS, "day", summary.questions.usedToday, summary.questions.limits.perDay);
  consider(UsageMeter.CHAT, "month", summary.chat.usedMonth, summary.chat.limits.perMonth);
  consider(UsageMeter.CHAT, "day", summary.chat.usedToday, summary.chat.limits.perDay);

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.percent > a.percent ? b : a));
}

function limitMessage(meter: UsageMeter, scope: "day" | "month", kind: ResolvedLimits["kind"]): string {
  const assine =
    kind === "TRIAL"
      ? "Assine um plano para continuar."
      : "Faça upgrade de plano para liberar mais.";
  if (meter === UsageMeter.CHAT) {
    return scope === "day"
      ? `Você atingiu o limite de mensagens de hoje. ${assine}`
      : `Você atingiu o limite de mensagens deste ciclo. ${assine}`;
  }
  return scope === "day"
    ? `Você atingiu o limite de questões de hoje. Amanhã libera de novo — ou ${assine.toLowerCase()}`
    : `Você atingiu o limite de questões deste ciclo. ${assine}`;
}

/**
 * Reserva `units` do medidor. Devolve o id da linha (para acertar/estornar) ou null quando
 * não há o que cobrar (admin).
 *
 * Lança `UsageLimitError` quando estoura E o enforcement está ligado. Em modo sombra a linha
 * é gravada do mesmo jeito — é isso que permite observar o consumo real antes de bloquear.
 */
export async function reserveUsage(input: {
  user: { id: string; role?: Role };
  meter: UsageMeter;
  kind: UsageKind;
  units: number;
  limits?: ResolvedLimits;
}): Promise<string | null> {
  const limits = input.limits ?? (await resolveLimits(input.user));
  if (limits.kind === "ADMIN") return null;

  const units = Math.max(1, Math.trunc(input.units));
  const meterLimits = input.meter === UsageMeter.QUESTIONS ? limits.questions : limits.chat;

  const entry = await prisma.usageLedger.create({
    data: {
      userId: input.user.id,
      meter: input.meter,
      kind: input.kind,
      costUnits: units,
      subscriptionId: limits.subscriptionId,
      planId: limits.planId
    },
    select: { id: true }
  });

  // Sem teto ou em modo sombra não há o que verificar — a linha já cumpriu seu papel.
  if ((meterLimits.perMonth === null && meterLimits.perDay === null) || !limits.enforcement) {
    return entry.id;
  }

  const [usedMonth, usedToday] = await Promise.all([
    sumUsage(input.user.id, input.meter, limits.period.start),
    sumUsage(input.user.id, input.meter, startOfDayInBrazil())
  ]);

  const overMonth = meterLimits.perMonth !== null && usedMonth > meterLimits.perMonth;
  const overDay = meterLimits.perDay !== null && usedToday > meterLimits.perDay;

  if (overMonth || overDay) {
    await refundUsage(entry.id);
    const scope = overDay ? "day" : "month";
    throw new UsageLimitError(limitMessage(input.meter, scope, limits.kind), input.meter, scope);
  }

  return entry.id;
}

/** Ajusta a reserva para o consumo real (só para baixo — reserva é o teto do que foi pedido). */
export async function settleUsage(ledgerId: string | null, actualUnits: number): Promise<void> {
  if (!ledgerId) return;
  const units = Math.max(0, Math.trunc(actualUnits));
  await prisma.usageLedger
    .updateMany({ where: { id: ledgerId, costUnits: { gt: units } }, data: { costUnits: units } })
    .catch(() => undefined);
}

/** Motivo do corte, para a mensagem ao usuário não culpar o limite errado. */
export type QuantityCapReason =
  | "PLANO_GRATUITO"
  | "TAMANHO_DO_BLOCO"
  | "COTA_DIARIA"
  | "COTA_MENSAL"
  | "TETO_DO_PRODUTO";

export type GenerationAllowance = {
  /** Maior bloco que este usuário pode gerar agora, já considerando cota e teto. null = sem teto. */
  maxPerBlock: number | null;
  reason: QuantityCapReason | null;
  /** true quando não sobrou cota nem para um bloco mínimo — recusar é melhor que gerar um toco. */
  exhausted: boolean;
  limits: ResolvedLimits;
};

/** Abaixo disso um bloco não vale a pena: recusar com convite é melhor que entregar 2 questões. */
const MIN_USEFUL_BLOCK = 3;

/**
 * Quanto o usuário pode gerar AGORA, e por que está limitado.
 *
 * Substitui o antigo `getQuestionQuantityCap`, que só conhecia o teto do trial e por isso
 * fazia toda mensagem de corte dizer "plano gratuito" — o que vira mentira para o assinante
 * que esbarrou na rajada diária.
 */
export async function resolveGenerationAllowance(
  user: { id: string; role?: Role },
  limits?: ResolvedLimits
): Promise<GenerationAllowance> {
  const resolved = limits ?? (await resolveLimits(user));
  if (resolved.kind === "ADMIN") {
    // Admin não tem plano nem cota, mas o teto do produto é técnico (tokens de saída por
    // lote e repetição entre lotes) e vale para todo mundo.
    return {
      maxPerBlock: QUESTION_LIMITS.maxPerBlock,
      reason: "TETO_DO_PRODUTO",
      exhausted: false,
      limits: resolved
    };
  }

  const blockCap = resolved.maxQuestionsPerGeneration;
  // Teto do produto entra na disputa como qualquer outro: acima dele a espera cresce (cada
  // lote é uma chamada sequencial) e os últimos lotes começam a repetir o que já saiu.
  const candidates: Array<{ value: number; reason: QuantityCapReason }> = [
    { value: QUESTION_LIMITS.maxPerBlock, reason: "TETO_DO_PRODUTO" }
  ];
  if (blockCap !== null) {
    candidates.push({ value: blockCap, reason: resolved.kind === "TRIAL" ? "PLANO_GRATUITO" : "TAMANHO_DO_BLOCO" });
  }

  // O saldo só entra na conta quando ele de fato bloqueia. Em modo sombra o teto do bloco
  // continua valendo (é regra de plano, não de consumo), mas a cota não corta nada.
  if (resolved.enforcement) {
    const status = await getMeterStatus(user, UsageMeter.QUESTIONS, resolved);
    const remainingMonth =
      status.limits.perMonth === null ? null : Math.max(0, status.limits.perMonth - status.usedMonth);
    const remainingDay = status.limits.perDay === null ? null : Math.max(0, status.limits.perDay - status.usedToday);
    if (remainingDay !== null) candidates.push({ value: remainingDay, reason: "COTA_DIARIA" });
    if (remainingMonth !== null) candidates.push({ value: remainingMonth, reason: "COTA_MENSAL" });
  }

  if (candidates.length === 0) {
    return { maxPerBlock: null, reason: null, exhausted: false, limits: resolved };
  }

  const tightest = candidates.reduce((a, b) => (b.value < a.value ? b : a));
  return {
    maxPerBlock: tightest.value,
    reason: tightest.reason,
    // Só considera esgotado quando o aperto vem de COTA — teto de bloco pequeno é regra do
    // plano, não falta de saldo, e nunca deve recusar a geração.
    exhausted:
      tightest.value < MIN_USEFUL_BLOCK && (tightest.reason === "COTA_DIARIA" || tightest.reason === "COTA_MENSAL"),
    limits: resolved
  };
}

/**
 * Devolve a reserva quando a ação não entregou resultado.
 *
 * Estorno é soft e best-effort: marcar `refundedAt` é idempotente por construção, e falhar
 * aqui nunca pode derrubar o tratamento de erro que está em andamento.
 */
export async function refundUsage(ledgerId: string | null): Promise<void> {
  if (!ledgerId) return;
  await prisma.usageLedger
    .updateMany({ where: { id: ledgerId, refundedAt: null }, data: { refundedAt: new Date() } })
    .catch(() => undefined);
}
