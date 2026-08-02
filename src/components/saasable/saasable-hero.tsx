import Link from "next/link";
import { Wave } from "@/components/saasable/wave";
import { Reveal } from "@/components/saasable/reveal";
import { SaasableProductDemo } from "@/components/saasable/saasable-product-demo";

const TRUST_ITEMS = ["Chat com contexto", "Certo/Errado e alternativas", "Histórico salvo", "Reembolso garantido em 7 dias"];

export function SaasableHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute top-0 z-10 inset-x-0 block bg-theme-bg-default h-[560px] sm:h-[700px] lg:h-[820px] overflow-hidden rounded-b-3xl sm:rounded-b-[32px] lg:rounded-b-[40px]" />
      <div className="common-section relative z-20">
        <div className="saasable-container">
          <div className="pb-5 sm:pb-11 lg:pb-12">
            <Reveal className="flex flex-col items-center gap-3">
              <div className="inline-flex items-center p-1 rounded-full border border-theme-divider bg-theme-bg-default">
                <span className="px-2 text-[12px] font-semibold text-theme-text-secondary">Geração por IA</span>
                <div className="bg-primary-100 inline-flex items-center py-1 px-2 rounded-full gap-1">
                  <i className="ti ti-sparkles text-primary-500 text-sm leading-none" />
                  <span className="text-primary-500 font-semibold text-xs leading-none">Certo/Errado e múltipla escolha</span>
                </div>
              </div>
              <h1 className="h1 max-w-[800px] text-center">Questões novas a cada prompt. No padrão da sua banca.</h1>
              <div className="text-primary-500 pt-1 pb-1.5">
                <Wave className="w-[92px] md:w-[122px] h-auto" />
              </div>
              <h6 className="h6 max-w-[650px] text-center text-theme-text-secondary font-normal">
                Peça por matéria, formato ou dificuldade e a IA monta um bloco de Certo/Errado ou múltipla escolha na
                hora, consultando provas, editais e leis reais da plataforma.
              </h6>
            </Reveal>
            <Reveal delay={0.1} className="flex flex-col items-center gap-4 mt-6 sm:mt-8 lg:mt-10">
              <Link href="/register" className="btn btn-primary btn-md capitalize">
                <span className="flex items-center gap-2 -ml-1">
                  <i className="ti ti-sparkles text-base leading-none" />
                  Criar conta grátis
                </span>
              </Link>
              <div className="flex flex-row gap-2 justify-center flex-wrap">
                {TRUST_ITEMS.map((item) => (
                  <div key={item} className="inline-flex items-center px-2 rounded-full border border-theme-divider bg-theme-bg-default">
                    <i className="ti ti-check text-primary-500 text-sm leading-none ml-1.5" />
                    <span className="text-xs py-1.5 px-2 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <SaasableProductDemo />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
