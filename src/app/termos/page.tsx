import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LegalPage } from "@/components/legal-page";
import { getAppSettings } from "@/lib/app-settings";
import { defaultTermsContent, legalIdentityFrom } from "@/lib/legal-defaults";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Termos de Uso",
    description: "Regras de uso da plataforma: assinatura, cancelamento e responsabilidades.",
    alternates: { canonical: "/termos" }
  };
}

export default async function TermosPage() {
  const settings = await getAppSettings();
  // Conteúdo interno tem prioridade; senão, redireciona p/ URL externa; senão, boilerplate.
  if (!settings.termsContent && settings.termsUrl) redirect(settings.termsUrl);
  const markdown = settings.termsContent?.trim() || defaultTermsContent(legalIdentityFrom(settings));

  return <LegalPage logoUrl={settings.logoUrl} appName={settings.appName} title="Termos de Uso" markdown={markdown} />;
}
