import { Building2, Mail } from "lucide-react";
import { auth } from "@/auth";
import { ContactForm } from "@/components/contact-form";
import { SaasableAssets } from "@/components/saasable/saasable-assets";
import { SaasableNavbar } from "@/components/saasable/saasable-navbar";
import { SaasableFooter } from "@/components/saasable/saasable-footer";
import { SaasablePageHeader } from "@/components/saasable/saasable-page-header";
import { Reveal } from "@/components/saasable/reveal";
import { getAppSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function ContatoPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const [appSettings, params, session] = await Promise.all([getAppSettings(), searchParams, auth()]);
  const isTeams = params.empresa === "1";

  return (
    <>
      <SaasableAssets />
      <main className="dm-ready min-h-screen bg-theme-bg-default text-theme-text-primary">
        <SaasableNavbar logoUrl={appSettings.logoUrl} appName={appSettings.appName} isLoggedIn={Boolean(session?.user)} />

        <section className="common-section">
          <div className="saasable-container max-w-3xl">
            <SaasablePageHeader
              icon={isTeams ? <Building2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              badge={isTeams ? "Planos para empresas" : "Fale com a gente"}
              title={isTeams ? "Monte um plano para sua equipe" : "Entre em contato"}
              description={
                isTeams
                  ? "Conte quantas pessoas participariam e como funciona seu grupo. Retornamos com uma proposta de assinatura em grupo com preço personalizado."
                  : "Dúvidas, sugestões ou suporte: envie sua mensagem e responderemos por e-mail."
              }
            />

            <Reveal delay={0.1} className="mt-10 rounded-3xl bg-theme-bg-paper p-6 md:p-8">
              <ContactForm defaultTeams={isTeams} />
            </Reveal>
          </div>
        </section>

        <SaasableFooter logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
      </main>
    </>
  );
}
