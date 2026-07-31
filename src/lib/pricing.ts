import { CAPABILITIES, CAPABILITY_KEYS, parseCapabilities, type CapabilityDef } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";

/**
 * Bullets escritos à mão só precisam cobrir o que é comum a todos os planos — o que
 * DIFERENCIA um plano do outro é derivado das capabilities, automaticamente.
 */
export const defaultPlanFeatures = [
  "{questoesMes} questões geradas por mês",
  "Blocos de até {questoesBloco} questões de uma vez",
  "Chat para gerar questões, simulados, revisões e materiais",
  "Histórico salvo com blocos gerados",
  "Revisão com base em erros e favoritos"
];

type PlanQuotas = {
  questionsPerMonth?: number | null;
  questionsPerDay?: number | null;
  maxQuestionsPerGeneration?: number | null;
  chatMessagesPerDay?: number | null;
};

/**
 * Substitui os marcadores de cota no texto do bullet.
 *
 * Linha com marcador de cota ILIMITADA é removida em vez de virar "ilimitado questões por
 * mês": um plano sem teto não deve anunciar um número, e frase quebrada no card de preço
 * custa mais confiança do que o bullet ganharia.
 */
function applyQuotaPlaceholders(feature: string, plan: PlanQuotas & { aiGenerationsPerDay: number }): string | null {
  const values: Record<string, number | null | undefined> = {
    "{questoesMes}": plan.questionsPerMonth,
    "{questoesDia}": plan.questionsPerDay,
    "{questoesBloco}": plan.maxQuestionsPerGeneration,
    "{mensagensDia}": plan.chatMessagesPerDay,
    // Compatibilidade com bullets antigos gravados no banco.
    "{limit}": plan.questionsPerMonth ?? plan.aiGenerationsPerDay
  };

  let result = feature;
  for (const [token, value] of Object.entries(values)) {
    if (!result.includes(token)) continue;
    if (value === null || value === undefined) return null;
    result = result.replaceAll(token, String(value));
  }
  return result;
}

export async function getPricingContent() {
  return (
    (await prisma.pricingContent.findUnique({ where: { id: "default" } })) ??
    (await prisma.pricingContent.create({ data: { id: "default" } }))
  );
}

/** Normaliza para comparar bullets: sem acento, sem caixa, sem pontuação, espaço colapsado. */
function normalizeForCompare(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bullets derivados das capabilities ligadas no plano.
 *
 * Existe porque o card mentia por omissão: `materialExpandEnabled` era a única feature
 * paga do produto e NUNCA aparecia no preço — se o admin não escrevesse o bullet à mão,
 * o cliente não tinha como saber que ela existia. Agora ligar a feature no admin já a
 * coloca no argumento de venda.
 */
function derivedCapabilityBullets(rawCapabilities: unknown): string[] {
  const capabilities = parseCapabilities(rawCapabilities, "plan");
  const bullets: string[] = [];

  for (const key of CAPABILITY_KEYS) {
    // Alargado para CapabilityDef de propósito: com o tipo literal do registry, o TS conclui
    // que hoje nenhuma capability `int` tem bullet e passa a acusar o ramo dos números como
    // inalcançável — o que quebraria no dia em que alguém adicionasse uma.
    const def = CAPABILITIES[key] as CapabilityDef;
    if (!def.marketingBullet) continue;
    const value = capabilities[key];
    if (def.type === "int") {
      if (typeof value === "number" && value > 0) {
        bullets.push(def.marketingBullet.replaceAll("{value}", String(value)));
      }
      continue;
    }
    if (value === true) bullets.push(def.marketingBullet);
  }

  return bullets;
}

/**
 * Lista final de bullets do card: o que o admin escreveu + o que as capabilities implicam.
 *
 * O bullet manual sempre vence: se o admin já descreveu a feature com as próprias palavras,
 * o derivado é descartado. A comparação é por conteúdo (sem acento/caixa) e por continência,
 * para "Simulados cronometrados" escrito à mão suprimir "Simulados cronometrados com nota
 * líquida" — senão o card repetiria a mesma promessa em duas linhas.
 */
export function planFeatures(
  plan: PlanQuotas & { features: string[]; aiGenerationsPerDay: number; capabilities?: unknown }
) {
  const manual = (plan.features.length ? plan.features : defaultPlanFeatures)
    .map((feature) => applyQuotaPlaceholders(feature, plan)?.trim())
    .filter((feature): feature is string => Boolean(feature));

  const manualNormalized = manual.map(normalizeForCompare);
  const derived = derivedCapabilityBullets(plan.capabilities).filter((bullet) => {
    const normalized = normalizeForCompare(bullet);
    return !manualNormalized.some((existing) => existing.includes(normalized) || normalized.includes(existing));
  });

  return [...manual, ...derived];
}
