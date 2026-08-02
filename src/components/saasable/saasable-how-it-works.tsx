import { Reveal } from "@/components/saasable/reveal";

const STEPS = [
  {
    step: "1",
    title: "Peça do seu jeito",
    text: 'Ex.: "gere 10 questões difíceis de geografia com 5 alternativas".'
  },
  {
    step: "2",
    title: "A IA monta o bloco",
    text: "O gerador cria questões estruturadas, alternativas, gabarito e justificativas."
  },
  {
    step: "3",
    title: "Responda ou salve",
    text: "Tudo fica disponível no histórico para estudar, simular e revisar depois."
  }
];

export function SaasableHowItWorks() {
  return (
    <section className="common-section">
      <div className="saasable-container">
        <div className="flex flex-col gap-6 sm:gap-8 md:gap-10">
          <Reveal className="flex flex-col gap-2 sm:gap-3 items-center text-center">
            <h2 className="h2">O aluno conversa. O sistema salva o treino.</h2>
          </Reveal>
          <Reveal delay={0.1} className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((item) => (
              <div key={item.step} className="rounded-3xl sm:rounded-[32px] bg-theme-bg-default p-6 sm:p-8 flex flex-col gap-4 items-start">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white">
                  {item.step}
                </span>
                <div>
                  <h4 className="h4">{item.title}</h4>
                  <p className="mt-2 body1 text-theme-text-secondary">{item.text}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
