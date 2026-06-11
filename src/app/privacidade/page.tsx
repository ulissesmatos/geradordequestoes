import { redirect } from "next/navigation";
import { LegalPage } from "@/components/legal-page";
import { getAppSettings } from "@/lib/app-settings";
import { defaultPrivacyContent } from "@/lib/legal-defaults";

export const dynamic = "force-dynamic";

export default async function PrivacidadePage() {
  const settings = await getAppSettings();
  if (!settings.privacyContent && settings.privacyUrl) redirect(settings.privacyUrl);
  const markdown = settings.privacyContent?.trim() || defaultPrivacyContent(settings.appName);

  return (
    <LegalPage logoUrl={settings.logoUrl} appName={settings.appName} title="Política de Privacidade" markdown={markdown} />
  );
}
