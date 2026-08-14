"use client";

import { useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Reveal } from "@/components/saasable/reveal";
import { FAQ_ITEMS } from "@/lib/faq-content";

// AnimatePresence/m aqui dependem do <LazyMotion> que o <Reveal> ao redor já monta —
// por isso este componente só anima quando renderizado dentro de um Reveal.

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
                        <m.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 sm:pt-3">
                            <p className="body1 text-theme-text-secondary">{item.answer}</p>
                          </div>
                        </m.div>
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
