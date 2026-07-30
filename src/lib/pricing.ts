import { CAPABILITIES, CAPABILITY_KEYS, parseCapabilities, type CapabilityDef } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";

/**
 * Bullets escritos à mão só precisam cobrir o que é comum a todos os planos — o que
 * DIFERENCIA um plano do outro é derivado das capabilities, automaticamente.
 */
export const defaultPlanFeatures = [
  "Até {limit} usos de IA por dia",
  "Chat para gerar questões, simulados, revisões e materiais",
  "Histórico salvo com blocos gerados",
  "Revisão com base em erros e favoritos"
];

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
export function planFeatures(plan: { features: string[]; aiGenerationsPerDay: number; capabilities?: unknown }) {
  const manual = (plan.features.length ? plan.features : defaultPlanFeatures)
    .map((feature) => feature.replaceAll("{limit}", String(plan.aiGenerationsPerDay)).trim())
    .filter(Boolean);

  const manualNormalized = manual.map(normalizeForCompare);
  const derived = derivedCapabilityBullets(plan.capabilities).filter((bullet) => {
    const normalized = normalizeForCompare(bullet);
    return !manualNormalized.some((existing) => existing.includes(normalized) || normalized.includes(existing));
  });

  return [...manual, ...derived];
}
