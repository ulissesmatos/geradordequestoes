import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Configuração singleton de e-mail (id="default"), espelhando o padrão de
 * getPaymentSettings. A apiKey é decifrada para uso em runtime (texto puro
 * legado passa direto).
 */
export async function getEmailSettings() {
  const settings =
    (await prisma.emailSetting.findUnique({ where: { id: "default" } })) ??
    (await prisma.emailSetting.create({ data: { id: "default" } }));
  return {
    ...settings,
    apiKey: settings.apiKey ? decryptSecret(settings.apiKey) : settings.apiKey
  };
}

export type EmailSettings = Awaited<ReturnType<typeof getEmailSettings>>;
