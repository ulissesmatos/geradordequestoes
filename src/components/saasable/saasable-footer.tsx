import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

export function SaasableFooter({ logoUrl, appName }: { logoUrl: string; appName: string }) {
  const year = new Date().getFullYear();

  return (
    <section className="common-section !pt-0">
      <div className="saasable-container">
        <div className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-6">
            <div className="basis-full lg:basis-6/12">
              <div className="flex flex-col items-start gap-3">
                <AppLogo lightSrc={logoUrl} darkSrc="/brand/logo-white.png" alt={appName} className="h-8 w-auto" />
                <p className="body2 max-w-[320px] text-theme-text-secondary">
                  Gere questões, simulados e revisões com IA para o seu concurso.
                </p>
              </div>
            </div>
            <div className="basis-full lg:basis-6/12">
              <div className="flex flex-row flex-wrap justify-between gap-5 md:gap-8">
                <div>
                  <div className="flex flex-col gap-3 md:gap-4 items-start">
                    <h4 className="h4">Conta</h4>
                    <ul className="flex flex-col gap-2 caption2">
                      <li><Link href="/login" className="text-theme-text-secondary hover:text-primary-500 transition">Entrar</Link></li>
                      <li><Link href="/register" className="text-theme-text-secondary hover:text-primary-500 transition">Criar conta</Link></li>
                      <li><Link href="/pricing" className="text-theme-text-secondary hover:text-primary-500 transition">Planos</Link></li>
                      <li><Link href="/tutorial" className="text-theme-text-secondary hover:text-primary-500 transition">Tutorial</Link></li>
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="flex flex-col gap-3 md:gap-4 items-start">
                    <h4 className="h4">Empresa</h4>
                    <ul className="flex flex-col gap-2 caption2">
                      <li><Link href="/contato" className="text-theme-text-secondary hover:text-primary-500 transition">Contato</Link></li>
                      <li><Link href="/contato?empresa=1" className="text-theme-text-secondary hover:text-primary-500 transition">Planos para empresas</Link></li>
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="flex flex-col gap-3 md:gap-4 items-start">
                    <h4 className="h4">Legal</h4>
                    <ul className="flex flex-col gap-2 caption2">
                      <li><Link href="/termos" className="text-theme-text-secondary hover:text-primary-500 transition">Termos de uso</Link></li>
                      <li><Link href="/privacidade" className="text-theme-text-secondary hover:text-primary-500 transition">Privacidade</Link></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-theme-bg-default rounded-3xl sm:rounded-[32px]">
            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 p-4 sm:py-3 sm:px-6">
              <span className="caption2 text-theme-text-secondary">Copyright © {year} {appName}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
