import { Reveal } from "@/components/saasable/reveal";

const FEATURES = [
  {
    icon: "ti-message-chatbot",
    title: "Chat AI-first",
    text: "Escreva do seu jeito e a IA organiza matéria, formato, dificuldade e quantidade."
  },
  {
    icon: "ti-stack-2",
    title: "Blocos salvos",
    text: "Cada geração vira um bloco de questões para responder agora ou retomar depois."
  },
  {
    icon: "ti-books",
    title: "Questões fiéis ao acervo real",
    text: "A IA consulta provas, editais e leis cadastradas para gerar e fundamentar questões."
  },
  {
    icon: "ti-clock-check",
    title: "Simulados cronometrados",
    text: "Nota líquida e correção no padrão da banca, com tempo de prova real."
  }
];

export function SaasableFeatureGrid() {
  return (
    <section className="common-section">
      <div className="saasable-container">
        <div className="flex flex-col gap-6 sm:gap-8 md:gap-10">
          <Reveal>
            <h2 className="h2 text-center">Feito para quem estuda para concurso todo dia</h2>
          </Reveal>
          <Reveal delay={0.1} className="p-6 rounded-3xl sm:rounded-[32px] md:rounded-[40px] bg-theme-bg-default h-full relative">
            <div className="overflow-hidden">
              <div className="flex flex-row flex-wrap items-stretch divide-x divide-y relative -m-px divide-theme-divider">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="basis-full sm:basis-6/12 lg:basis-3/12">
                    <div className="px-0 py-3 sm:p-6 md:p-8 flex flex-col items-start h-full gap-6 sm:gap-8">
                      <div className="w-[60px] h-[60px] bg-theme-bg-paper rounded-full flex items-center justify-center">
                        <i className={`ti ${feature.icon} text-2xl leading-none text-primary-500`} />
                      </div>
                      <div className="flex flex-col gap-1 md:gap-2 grow">
                        <h4 className="h4">{feature.title}</h4>
                        <p className="body1 text-theme-text-secondary">{feature.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
