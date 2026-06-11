import { Building2, Mail } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { getAppSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function ContatoPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const [appSettings, params] = await Promise.all([getAppSettings(), searchParams]);
  const isTeams = params.empresa === "1";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={appSettings.logoUrl} appName={appSettings.appName} sticky={false} />

      <section className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-soft-foreground)]">
            {isTeams ? <Building2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {isTeams ? "Planos para empresas" : "Fale com a gente"}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {isTeams ? "Monte um plano para sua equipe" : "Entre em contato"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
            {isTeams
              ? "Conte quantas pessoas participariam e como funciona seu grupo. Retornamos com uma proposta de assinatura em grupo com preço personalizado."
              : "Dúvidas, sugestões ou suporte: envie sua mensagem e responderemos por e-mail."}
          </p>
        </div>

        <Card>
          <CardContent className="p-6 md:p-8">
            <ContactForm defaultTeams={isTeams} />
          </CardContent>
        </Card>
      </section>

      <SiteFooter logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
    </main>
  );
}
