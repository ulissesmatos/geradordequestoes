/**
 * Dados puros (sem "use client") — importado tanto pelo componente visual
 * (saasable-faq.tsx) quanto pelo JSON-LD (app/page.tsx, Server Component). Um
 * export de dados dentro de um módulo "use client" não é seguro de importar de
 * código server: o bundler troca o módulo por uma referência de cliente e o
 * array vira undefined em runtime (só quebra no build, não no `tsc --noEmit`).
 */
export const FAQ_ITEMS = [
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
