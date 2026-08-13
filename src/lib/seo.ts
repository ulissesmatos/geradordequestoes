import { getAppSettings } from "@/lib/app-settings";
import { appUrl } from "@/lib/payments";

/**
 * URL pública canônica do site: a configurada em /admin/branding, com fallback para as
 * mesmas variáveis de ambiente que o NextAuth já exige em produção (ver appUrl()). Sem
 * isso, metadataBase/robots/sitemap ficavam undefined sempre que o admin não preenchia
 * o campo — quebrando OG image, canonical e URLs absolutas do sitemap.
 */
export async function getSiteUrl(): Promise<string> {
  const appSettings = await getAppSettings();
  return appSettings.publicUrl || appUrl();
}
