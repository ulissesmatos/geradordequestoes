import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LegalPage } from "@/components/legal-page";
import { getAppSettings } from "@/lib/app-settings";
import { defaultPrivacyContent, legalIdentityFrom } from "@/lib/legal-defaults";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Política de Privacidade",
    description: "Como coletamos, usamos e protegemos os seus dados na plataforma.",
    alternates: { canonical: "/privacidade" }
  };
}

export default async function PrivacidadePage() {
  const settings = await getAppSettings();
  if (!settings.privacyContent && settings.privacyUrl) redirect(settings.privacyUrl);
  const markdown = settings.privacyContent?.trim() || defaultPrivacyContent(legalIdentityFrom(settings));

  return (
    <LegalPage logoUrl={settings.logoUrl} appName={settings.appName} title="Política de Privacidade" markdown={markdown} />
  );
}
