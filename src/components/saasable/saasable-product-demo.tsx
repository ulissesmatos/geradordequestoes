"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BotAvatar } from "@/components/bot-avatar";

const STEP_INTERVAL_MS = 2600;
const MAX_STEP = 2;

/**
 * Substitui o vídeo de demonstração do template (que é do próprio kit) por uma
 * demo roteirizada e 100% estática do produto real — nenhuma chamada de IA de
 * verdade, sem custo, nunca falha. O card de questão no passo 3 é fiel ao visual
 * real do QuestionRunner (botões C/E), não uma ilustração genérica.
 *
 * Os 3 quadros ficam SEMPRE montados no DOM (só opacity/transform mudam) — nunca
 * entram/saem da árvore. Montar/desmontar mudava a altura do card a cada passo,
 * empurrando o resto da página (CLS). Com os três sempre presentes, a altura do
 * card é constante desde o primeiro render.
 */
export function SaasableProductDemo() {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [step, setStep] = useState(shouldReduceMotion ? MAX_STEP : 0);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const timer = window.setInterval(() => {
      setStep((current) => (current >= MAX_STEP ? 0 : current + 1));
    }, STEP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shouldReduceMotion]);

  return (
    <div className="rounded-3xl sm:rounded-[32px] md:rounded-[40px] overflow-hidden h-auto w-full bg-theme-bg-paper p-3 sm:p-5 md:p-6 shadow-[0_20px_60px_-20px_rgba(10,98,104,0.25)]">
      <div className="rounded-2xl md:rounded-3xl bg-theme-bg-default p-4 sm:p-6 md:p-8">
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-500">
            <i className="ti ti-message-chatbot text-lg leading-none" />
            Chat IA
          </div>
          {!shouldReduceMotion && (
            <button
              type="button"
              onClick={() => setStep(0)}
              className="flex items-center gap-1.5 rounded-full border border-theme-divider px-3 py-1 text-xs font-medium text-theme-text-secondary transition hover:bg-theme-bg-paper"
            >
              <i className="ti ti-repeat text-sm leading-none" />
              Ver de novo
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 max-w-2xl mx-auto">
          <DemoFrame visible={step >= 0} reduceMotion={shouldReduceMotion}>
            <div className="ml-auto max-w-[85%] rounded-2xl bg-primary-100 p-4 text-sm text-primary-800">
              Gere 5 questões de Direito Administrativo sobre atos administrativos, Certo/Errado.
            </div>
          </DemoFrame>

          <DemoFrame visible={step >= 1} reduceMotion={shouldReduceMotion}>
            <div className="flex items-start gap-2.5">
              <BotAvatar />
              <div className="flex min-w-0 max-w-[88%] flex-1 flex-col gap-2">
                <div className="rounded-2xl border border-theme-divider bg-theme-bg-paper p-4 text-sm leading-6 text-theme-text-primary">
                  Pronto. Gerei um bloco de 5 questões de Direito Administrativo com base no acervo de provas da
                  plataforma. Já ficou salvo no seu histórico.
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-l-4 border-theme-divider border-l-primary-500 bg-theme-bg-paper p-3.5">
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-theme-text-primary">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-500">
                      <i className="ti ti-player-play text-sm leading-none" />
                    </span>
                    Questões geradas
                  </div>
                  <span className="btn btn-primary btn-md !px-3.5 !py-1.5 !text-xs">Responder agora</span>
                </div>
              </div>
            </div>
          </DemoFrame>

          <DemoFrame visible={step >= 2} reduceMotion={shouldReduceMotion}>
            <div className="rounded-2xl border border-theme-divider bg-theme-bg-paper p-5">
              <p className="caption text-theme-text-secondary uppercase">
                Direito Administrativo / Atos Administrativos / Certo ou Errado
              </p>
              <p className="mt-2.5 body1 text-theme-text-primary">
                O atributo da autoexecutoriedade permite que a Administração Pública execute suas próprias decisões,
                independentemente de prévia autorização do Poder Judiciário.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-xl border-2 border-primary-500 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800">
                  <i className="ti ti-check text-base leading-none" />
                  C) Certo
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-theme-divider px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                  E) Errado
                </div>
              </div>
            </div>
          </DemoFrame>
        </div>
      </div>
    </div>
  );
}

function DemoFrame({ visible, reduceMotion, children }: { visible: boolean; reduceMotion: boolean; children: React.ReactNode }) {
  if (reduceMotion) {
    return <div className={visible ? "opacity-100" : "opacity-0"}>{children}</div>;
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  );
}
