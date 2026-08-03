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
 */
export async function computeCostUsd(usage: TokenUsage): Promise<number | null> {
  const settings = await getAiSettings();
  if (settings.inputPricePerMillionUsd == null || settings.outputPricePerMillionUsd == null) return null;
  return (
    (usage.inputTokens / 1_000_000) * settings.inputPricePerMillionUsd +
    (usage.outputTokens / 1_000_000) * settings.outputPricePerMillionUsd
  );
}
