import { redirect } from "next/navigation";
import { LegalPage } from "@/components/legal-page";
import { getAppSettings } from "@/lib/app-settings";
import { defaultTermsContent } from "@/lib/legal-defaults";

export const dynamic = "force-dynamic";

export default async function TermosPage() {
  const settings = await getAppSettings();
  // Conteúdo interno tem prioridade; senão, redireciona p/ URL externa; senão, boilerplate.
  if (!settings.termsContent && settings.termsUrl) redirect(settings.termsUrl);
  const markdown = settings.termsContent?.trim() || defaultTermsContent(settings.appName);

  return <LegalPage logoUrl={settings.logoUrl} appName={settings.appName} title="Termos de Uso" markdown={markdown} />;
}
