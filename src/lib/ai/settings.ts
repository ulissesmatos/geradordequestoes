import { AiChatPresetUsageLevel, AiProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export async function getAiSettings() {
  const stored = await prisma.aiProviderSetting.findUnique({ where: { id: "default" } });
  return {
    provider: stored?.provider ?? AiProvider.OPENAI,
    apiKey: decryptSecret(stored?.apiKey) || process.env.OPENAI_API_KEY || "",
    model: stored?.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseUrl: stored?.baseUrl || "",
    siteUrl: stored?.siteUrl || "",
    appName: stored?.appName || "Questões Certo/Errado",
    chatPresetUsageLevel: stored?.chatPresetUsageLevel ?? AiChatPresetUsageLevel.MEDIO,
    webSearchEnabled: stored?.webSearchEnabled ?? false,
    webSearchApiKey: decryptSecret(stored?.webSearchApiKey) || "",
    /** Modelo dedicado à extração de questões de referências (vazio = modelo padrão). */
    extractionModel: stored?.extractionModel || "",
    /**
     * USD por 1M de tokens do modelo `model` acima — convertido de Decimal pra number aqui,
     * uma vez só, pra ninguém mais precisar lidar com o tipo Decimal do Prisma. null = preço
     * não configurado (quem calcula custo deve mostrar "—", nunca inventar número).
     */
    inputPricePerMillionUsd: stored?.inputPricePerMillionUsd != null ? stored.inputPricePerMillionUsd.toNumber() : null,
    outputPricePerMillionUsd: stored?.outputPricePerMillionUsd != null ? stored.outputPricePerMillionUsd.toNumber() : null,
    /** Modelo usado quando a capability `premiumModel` está ligada (vazio = feature inerte). */
    premiumModel: stored?.premiumModel || "",
    /** Chave-mestra: false = ninguém usa o modelo avançado, nem admin, nem quem tem a capability. */
    premiumModelEnabled: stored?.premiumModelEnabled ?? false,
    premiumInputPricePerMillionUsd:
      stored?.premiumInputPricePerMillionUsd != null ? stored.premiumInputPricePerMillionUsd.toNumber() : null,
    premiumOutputPricePerMillionUsd:
      stored?.premiumOutputPricePerMillionUsd != null ? stored.premiumOutputPricePerMillionUsd.toNumber() : null
  };
}

export function providerLabel(provider: AiProvider) {
  if (provider === AiProvider.CLAUDE) return "Claude";
  if (provider === AiProvider.OPENROUTER) return "OpenRouter";
  return "OpenAI";
}
