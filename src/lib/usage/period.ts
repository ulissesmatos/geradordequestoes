import { startOfMonthInBrazil, startOfNextMonthInBrazil } from "@/lib/dates";

/**
 * Janela de apuração da cota mensal.
 *
 * Trial usa mês de calendário; assinante usa o ANIVERSÁRIO da assinatura. A diferença não é
 * estética: com reset no dia 1º e cobrança por aniversário, quem assina dia 28 queima a cota
 * em dois dias, ganha cota nova no dia 1º e cancela — dois meses de uso por um pagamento.
 */

export type UsageAnchor = "MENSAL" | "ANIVERSARIO";

export type UsagePeriod = {
  start: Date;
  end: Date;
  anchor: UsageAnchor;
};

/**
 * Soma meses preservando o dia, com corte no último dia do mês de destino.
 *
 * `setMonth` cru transborda: 31/01 + 1 mês vira 03/03, o que faria o ciclo de quem assinou
 * dia 31 andar sozinho para a frente todo mês.
 */
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getUTCDate();
  const target = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth() + months,
      1,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds()
    )
  );
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

/**
 * Ciclo vigente contando a partir do início da assinatura.
 *
 * Avança de mês em mês em vez de calcular a diferença direto: é O(meses de assinatura), o que
 * é irrelevante, e não tem os casos de borda de fim de mês que a conta fechada teria.
 */
function currentAnniversaryCycle(startsAt: Date, now: Date): { start: Date; end: Date } {
  let index = 0;
  let start = startsAt;
  let end = addMonthsClamped(startsAt, 1);
  // Guarda de sanidade: 600 ciclos são 50 anos — se passar disso, algo está muito errado
  // com a data de início e é melhor devolver uma janela do que girar para sempre.
  while (end <= now && index < 600) {
    index += 1;
    start = end;
    end = addMonthsClamped(startsAt, index + 1);
  }
  return { start, end };
}

export function resolveUsagePeriod(
  subscription: { startsAt: Date; endsAt: Date | null } | null,
  now: Date = new Date()
): UsagePeriod {
  if (!subscription) {
    return { start: startOfMonthInBrazil(now), end: startOfNextMonthInBrazil(now), anchor: "MENSAL" };
  }

  // Pix: a assinatura tem prazo fixo de 30 dias e é recriada a cada pagamento, então o
  // próprio intervalo da linha é o ciclo.
  if (subscription.endsAt) {
    const end = subscription.endsAt;
    const start = new Date(Math.max(subscription.startsAt.getTime(), end.getTime() - 30 * 24 * 60 * 60 * 1000));
    return { start, end, anchor: "ANIVERSARIO" };
  }

  // Stripe: a renovação não cria linha nova (só checkout.session.completed chama
  // activatePaidSubscription), então startsAt é estável e serve de âncora do aniversário.
  const cycle = currentAnniversaryCycle(subscription.startsAt, now);
  return { ...cycle, anchor: "ANIVERSARIO" };
}
