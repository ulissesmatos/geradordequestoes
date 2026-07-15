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
    extractionModel: stored?.extractionModel || ""
  };
}

export function providerLabel(provider: AiProvider) {
  if (provider === AiProvider.CLAUDE) return "Claude";
  if (provider === AiProvider.OPENROUTER) return "OpenRouter";
  return "OpenAI";
}
