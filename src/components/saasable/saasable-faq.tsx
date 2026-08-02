"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/saasable/reveal";

const FAQ_ITEMS = [
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. Assinaturas por cartão renovam automaticamente até você cancelar; contratações via Pix valem só pelo prazo contratado, sem renovação automática. Além disso, por lei (CDC, art. 49) você tem 7 dias corridos após a contratação para desistir e pedir reembolso integral."
  },
  {
    question: "As questões geradas por IA são confiáveis?",
    answer:
      "A IA consulta o acervo de provas, editais e leis cadastrados na plataforma para se basear em fontes reais. Ainda assim, é conteúdo gerado — não é gabarito oficial nem posição de banca examinadora. Para informações críticas (editais, datas, legislação), sempre confira as fontes oficiais."
  },
  {
    question: "A IA pode errar uma questão ou o gabarito?",
    answer:
      "Pode acontecer. Por isso toda questão tem um botão de reportar problema (gabarito errado, enunciado confuso, desatualizada), e o time revisa o que é sinalizado."
  },
  {
    question: "Funciona para a minha banca ou concurso específico?",
    answer:
      "Você escolhe o formato (Certo/Errado ou múltipla escolha) e o estilo da questão no seu pedido, e a IA se apoia no acervo de provas reais cadastradas para gerar no padrão pedido. Não prometemos cobertura de toda banca ou edital específico — o forte aqui é gerar questões novas rápido, no formato que você precisa treinar."
  },
  {
    question: "Existe plano gratuito para testar?",
    answer: "Sim, a conta grátis vem com uma cota de uso renovada mensalmente, sem precisar de cartão de crédito."
  },
  {
    question: "Como funciona a revisão espaçada?",
    answer:
      "Toda questão que você responde entra numa agenda pessoal: quem você erra volta no dia seguinte; quem você acerta some por um intervalo cada vez maior (3, 7, 16 e 35 dias), até você dominar o assunto de vez."
  },
  {
    question: "O que acontece com meu histórico se eu cancelar?",
    answer: "Seu acesso continua ativo até o fim do período já pago; depois disso as renovações futuras é que param."
  },
  {
    question: "Dá para estudar Certo/Errado e múltipla escolha ao mesmo tempo?",
    answer: "Sim, os dois formatos são nativos da plataforma — você escolhe por bloco, sem precisar trocar de ferramenta."
  }
];

export function SaasableFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="common-section">
      <div className="saasable-container">
        <div className="flex flex-col gap-6 sm:gap-8">
          <Reveal className="flex flex-col gap-2 sm:gap-3 text-center items-center">
            <h2 className="h2">Antes de assinar</h2>
            <h6 className="h6 text-theme-text-secondary max-w-[650px] font-normal">Perguntas frequentes sobre a plataforma.</h6>
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-3">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={item.question} className="px-4 sm:px-6 py-3 sm:py-4 rounded-2xl md:rounded-3xl bg-theme-bg-default overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="group flex w-full flex-row items-center gap-3 text-left"
                  >
                    <div className="grow">
                      <h4 className="h4 my-2 group-hover:text-primary-500 transition">{item.question}</h4>
                    </div>
                    <div className="leading-none shrink-0">
                      <i className={`ti ${isOpen ? "ti-minus" : "ti-plus"} text-xl leading-none group-hover:text-primary-500`} />
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen &&
                      (shouldReduceMotion ? (
                        <div className="pt-2 sm:pt-3">
                          <p className="body1 text-theme-text-secondary">{item.answer}</p>
                        </div>
                      ) : (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 sm:pt-3">
                            <p className="body1 text-theme-text-secondary">{item.answer}</p>
                          </div>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
