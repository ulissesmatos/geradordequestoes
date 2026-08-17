import { getAiSettings } from "@/lib/ai/settings";

export type TokenUsage = { inputTokens: number; outputTokens: number };

export function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * Custo em USD do uso informado, com o preço configurado em /admin/ia NO MOMENTO da chamada.
 * Retorna null (nunca 0) quando o preço não está configurado — mostrar "custo não medido" é
 * mais honesto que inventar um número com preço zerado.
 *
 * `priceModel: "premium"` usa o par de preço do modelo avançado (`premiumInput/OutputPricePerMillionUsd`)
 * em vez do par do modelo padrão — só faz sentido quando a geração usou de fato o modelo
 * configurado como avançado (ver generateQuestions.ts).
 */
export async function computeCostUsd(usage: TokenUsage, priceModel: "default" | "premium" = "default"): Promise<number | null> {
  const settings = await getAiSettings();
  const inputPrice = priceModel === "premium" ? settings.premiumInputPricePerMillionUsd : settings.inputPricePerMillionUsd;
  const outputPrice = priceModel === "premium" ? settings.premiumOutputPricePerMillionUsd : settings.outputPricePerMillionUsd;
  if (inputPrice == null || outputPrice == null) return null;
  return (usage.inputTokens / 1_000_000) * inputPrice + (usage.outputTokens / 1_000_000) * outputPrice;
}
