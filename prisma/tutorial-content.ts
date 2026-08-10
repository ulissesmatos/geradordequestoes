/**
 * Conteúdo definitivo dos guias de tutorial — fonte única, usada em dois lugares:
 *
 * 1. `prisma/seed.ts` faz upsert (create-only, nunca sobrescreve edição feita depois pelo
 *    admin) de TutorialGuide/TutorialStep a partir daqui, em todo deploy.
 * 2. `scripts/capture-tutorial-screenshots.ts` lê o campo `capture` (só existe em dev, nunca
 *    chega ao banco) pra saber que URL abrir e o que recortar na hora de gerar cada imagem.
 *
 * `imageUrl` já é o caminho FINAL do arquivo estático (public/tutorial/**) — o script de
 * captura escreve exatamente nesse caminho, então texto e imagem nunca ficam com nome
 * dessincronizado.
 */

export type StepCapture = {
  /** Pode conter os placeholders :chatSessionId / :mockExamId / :chatQuestionSetId. */
  url: string;
  /** Seletor CSS/testid pra recortar. Ausente = página inteira. */
  selector?: string;
  /** Quando o seletor casa mais de um elemento (ex.: 2 ResultCard na mesma conversa). */
  selectorIndex?: number;
  /** Clica antes de tirar o print (abrir modal de compartilhar, responder uma questão…). */
  click?: string;
  /** Espera esse seletor aparecer antes de tirar o print (garante que a ação do `click` já rendeu). */
  waitFor?: string;
};

export type TutorialStepSeed = {
  order: number;
  title: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
  capture?: StepCapture;
};

export type TutorialGuideSeed = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  ctaLabel?: string;
  ctaUrl?: string;
  displayOrder: number;
  steps: TutorialStepSeed[];
};

function img(guideSlug: string, file: string) {
  return `/tutorial/${guideSlug}/${file}`;
}

export const TUTORIAL_GUIDES: TutorialGuideSeed[] = [
  {
    slug: "painel",
    title: "Seu painel",
    description: "Onde você chega depois de entrar: sequência de estudo, meta do dia e o que revisar.",
    icon: "ti-layout-dashboard",
    ctaLabel: "Abrir o painel",
    ctaUrl: "/desempenho",
    displayOrder: 0,
    steps: [
      {
        order: 1,
        title: "Tudo em um lugar só",
        body: "O painel reúne sua sequência de estudo, a meta do dia, o que está pendente de revisão e como você tem ido em cada matéria. É a primeira tela depois de completar o cadastro.",
        imageUrl: img("painel", "01-visao-geral.webp"),
        imageAlt: "Painel do aluno com sequência, meta do dia e gráficos de desempenho",
        capture: { url: "/desempenho", waitFor: "text=Últimos 30 dias" }
      },
      {
        order: 2,
        title: "Sequência, meta e revisões do dia",
        body: "Os três cards do topo respondem a mesma pergunta: **o que eu faço agora?**\n\n- **Sequência**: dias seguidos estudando — estudar hoje mantém o número, pular um dia zera.\n- **Meta do dia**: quantas questões você já respondeu perto da sua meta diária (ajustável em Perfil).\n- **Revisões pendentes**: questões que erraram ou acertaram há algum tempo e estão prontas para voltar.",
        imageUrl: img("painel", "02-cards-do-dia.webp"),
        imageAlt: "Cards de sequência, meta do dia e revisões pendentes",
        capture: { url: "/desempenho", selector: '[data-testid="today-cards"]', waitFor: '[data-testid="today-cards"]' }
      },
      {
        order: 3,
        title: "Acerto por matéria",
        body: "Acompanhe sua taxa de acerto em cada matéria que você já praticou. É o primeiro lugar para notar se uma matéria específica está pedindo mais atenção.",
        imageUrl: img("painel", "03-acerto-por-materia.webp"),
        imageAlt: "Gráfico de barras com o acerto por matéria",
        capture: { url: "/desempenho", selector: '[data-testid="subject-accuracy-card"]', waitFor: '[data-testid="subject-accuracy-card"]' }
      },
      {
        order: 4,
        title: "Assuntos para reforçar",
        body: "Depois de pelo menos 5 tentativas em um assunto, ele entra automaticamente nesta lista se a sua taxa de acerto for baixa. Clique em **Revisar** para já abrir o Chat IA com um pedido de questões focado naquele ponto fraco.",
        imageUrl: img("painel", "04-assuntos-para-reforcar.webp"),
        imageAlt: "Lista de assuntos com menor taxa de acerto e botão Revisar",
        capture: { url: "/desempenho", selector: '[data-testid="worst-topics-card"]', waitFor: '[data-testid="worst-topics-card"]' }
      }
    ]
  },
  {
    slug: "chat-ia",
    title: "Chat com a IA",
    description: "Peça questões e materiais de estudo em uma conversa — é o principal jeito de usar a plataforma.",
    icon: "ti-sparkles",
    ctaLabel: "Abrir o chat",
    ctaUrl: "/ai",
    displayOrder: 1,
    steps: [
      {
        order: 1,
        title: "Peça o que precisar em uma frase",
        body: "No Chat IA você descreve o que quer — matéria, assunto, dificuldade e quantidade — e a IA gera as questões ou o material na hora. Não existe formulário obrigatório: quanto mais específico o pedido, mais direcionado o resultado.\n\n> Exemplo: *\"Gere 10 questões certo/errado de Direito Constitucional sobre controle de constitucionalidade, nível difícil\"*",
        imageUrl: img("chat-ia", "01-nova-conversa.webp"),
        imageAlt: "Tela do Chat IA com o campo para digitar o pedido",
        capture: { url: "/ai?new=1", waitFor: "textarea" }
      },
      {
        order: 2,
        title: "Suas conversas ficam salvas",
        body: "Cada conversa vira uma sessão na barra lateral, com título automático. Você pode continuar de onde parou, pedir mais questões sobre o mesmo assunto ou começar uma conversa nova a qualquer momento.",
        imageUrl: img("chat-ia", "02-historico-conversas.webp"),
        imageAlt: "Barra lateral com o histórico de conversas do chat",
        capture: { url: "/ai?sessionId=:chatSessionId", waitFor: "text=crase" }
      },
      {
        order: 3,
        title: "Responda ou guarde para depois",
        body: "Quando a IA termina de gerar um bloco de questões, aparece um card com o botão **Responder agora** — ele leva direto para a tela de prática. O bloco também fica salvo na sua Biblioteca, então não precisa responder na hora.",
        imageUrl: img("chat-ia", "03-card-questoes-geradas.webp"),
        imageAlt: "Card de resultado com o botão Responder agora",
        capture: {
          url: "/ai?sessionId=:chatSessionId",
          selector: '[data-testid="chat-result-card"]',
          selectorIndex: 0,
          waitFor: 'text=Questões geradas'
        }
      },
      {
        order: 4,
        title: "Peça um resumo pra revisar",
        body: "O chat também gera **materiais de estudo** — resumos, esquemas e explicações — sempre que você pedir algo como *\"faça um resumo sobre esse assunto\"*. O material fica disponível para reabrir em Materiais.",
        imageUrl: img("chat-ia", "04-card-material-gerado.webp"),
        imageAlt: "Card de resultado com o botão Abrir material",
        capture: {
          url: "/ai?sessionId=:chatSessionId",
          selector: '[data-testid="chat-result-card"]',
          selectorIndex: 1,
          waitFor: "text=Material gerado"
        }
      }
    ]
  },
  {
    slug: "praticar-questoes",
    title: "Praticar questões",
    description: "O banco de questões da plataforma e como responder no estilo Certo/Errado.",
    icon: "ti-list-check",
    ctaLabel: "Ir para Questões",
    ctaUrl: "/questoes",
    displayOrder: 2,
    steps: [
      {
        order: 1,
        title: "O banco de questões da plataforma",
        body: "Além das questões que você gera pelo chat, existe um banco geral com questões de todas as matérias. Use os filtros para escolher matéria, assunto, dificuldade e status antes de praticar.",
        imageUrl: img("praticar-questoes", "01-banco-de-questoes.webp"),
        imageAlt: "Banco de questões com filtros por matéria e dificuldade",
        capture: { url: "/questoes", waitFor: "text=Banco de questões" }
      },
      {
        order: 2,
        title: "Responda no estilo Certo/Errado",
        body: "Cada questão traz um enunciado e as opções **Certo** e **Errado**, no mesmo formato das provas Cebraspe. Ao responder, a correção aparece imediatamente — sem esperar terminar o bloco inteiro.",
        imageUrl: img("praticar-questoes", "02-respondendo.webp"),
        imageAlt: "Questão Certo/Errado com as opções de resposta",
        capture: { url: "/biblioteca?setId=:chatQuestionSetId", selector: '[data-testid="question-runner"]', waitFor: '[data-testid="question-runner"]' }
      },
      {
        order: 3,
        title: "Veja a explicação na hora",
        body: "Errou ou acertou, a explicação aparece embaixo da questão assim que você responde — é o momento em que a informação mais gruda. Clique em **Próxima questão** para seguir no bloco.",
        imageUrl: img("praticar-questoes", "03-explicacao.webp"),
        imageAlt: "Explicação exibida logo após responder a questão",
        capture: {
          url: "/biblioteca?setId=:chatQuestionSetId",
          click: 'button:has-text("Certo")',
          selector: '[data-testid="question-runner"]',
          waitFor: "text=Resposta"
        }
      }
    ]
  },
  {
    slug: "revisao-espacada",
    title: "Revisão espaçada",
    description: "Questões que você errou voltam logo; as que acertou voltam em intervalos crescentes.",
    icon: "ti-calendar-time",
    ctaLabel: "Ver minha revisão",
    ctaUrl: "/revisao",
    displayOrder: 3,
    steps: [
      {
        order: 1,
        title: "Sua agenda de revisão",
        body: "Toda questão que você responde entra automaticamente numa agenda de revisão espaçada: **errou, volta no dia seguinte**; **acertou, volta em 3, depois 7, depois 16, depois 35 dias**. Você não precisa organizar nada — é só voltar aqui quando tiver algo vencido.",
        imageUrl: img("revisao-espacada", "01-agenda.webp"),
        imageAlt: "Tela de revisão espaçada mostrando questões vencidas",
        capture: { url: "/revisao", waitFor: "h1:has-text(\"Revisão\")" }
      },
      {
        order: 2,
        title: "Uma sessão focada no que está atrasado",
        body: "Clique em **Começar revisão** para responder só as questões vencidas, até 20 por sessão — no mesmo formato Certo/Errado de sempre. Quanto mais vencida a questão, mais prioridade ela tem na fila.",
        imageUrl: img("revisao-espacada", "02-comecar-revisao.webp"),
        imageAlt: "Sessão de revisão em andamento, respondendo uma questão vencida",
        capture: { url: "/revisao?start=1", waitFor: "text=Certo" }
      }
    ]
  },
  {
    slug: "simulados",
    title: "Simulados",
    description: "Provas cronometradas no estilo Cebraspe, com resultado detalhado ao final.",
    icon: "ti-clock-play",
    ctaLabel: "Ver simulados",
    ctaUrl: "/simulados",
    displayOrder: 4,
    steps: [
      {
        order: 1,
        title: "Provas cronometradas",
        body: "Simulados reúnem questões de várias matérias num tempo fechado, exatamente como uma prova de verdade. Uma vez iniciado, o cronômetro não pausa — encerre com calma antes de começar.",
        imageUrl: img("simulados", "01-lista.webp"),
        imageAlt: "Lista de simulados disponíveis",
        capture: { url: "/simulados", waitFor: "h1:has-text(\"Simulados\")" }
      },
      {
        order: 2,
        title: "Resultado detalhado ao final",
        body: "Ao terminar (ou quando o tempo acaba), você vê a nota líquida, quantas acertou, errou e deixou em branco — mesmo critério de correção das provas Cebraspe, que descontam erro.",
        imageUrl: img("simulados", "02-resultado.webp"),
        imageAlt: "Tela de resultado do simulado com nota líquida",
        capture: { url: "/simulados/:mockExamId/resultado", waitFor: "text=Nota líquida" }
      }
    ]
  },
  {
    slug: "biblioteca-materiais",
    title: "Biblioteca e materiais",
    description: "Onde ficam os blocos de questões gerados, seus favoritos e os materiais de estudo.",
    icon: "ti-folder",
    ctaLabel: "Abrir biblioteca",
    ctaUrl: "/biblioteca",
    displayOrder: 5,
    steps: [
      {
        order: 1,
        title: "Todos os seus blocos de questões",
        body: "Cada bloco que você gera pelo chat — ou responde do banco de questões — fica salvo aqui, com abas para separar por tipo (questões, simulados, revisões) e status (em andamento, respondidos).",
        imageUrl: img("biblioteca-materiais", "01-blocos.webp"),
        imageAlt: "Biblioteca com os blocos de questões salvos",
        capture: { url: "/biblioteca", waitFor: "h1:has-text(\"Biblioteca\")" }
      },
      {
        order: 2,
        title: "Marque favoritos para estudar depois",
        body: "Toque no ícone de coração em qualquer questão para marcá-la como favorita. A aba **Favoritos** reúne tudo num só lugar — útil para juntar questões difíceis de várias fontes diferentes numa lista de revisão manual.",
        imageUrl: img("biblioteca-materiais", "02-favoritos.webp"),
        imageAlt: "Aba de questões favoritas",
        capture: { url: "/biblioteca?tab=favoritos", waitFor: "text=Favoritos" }
      },
      {
        order: 3,
        title: "Materiais de estudo da IA",
        body: "Resumos e materiais pedidos no chat ficam em **Materiais**, separados dos blocos de questões. Cada material pode ser reaberto, e alguns planos permitem pedir para a IA aprofundar um tópico específico do texto.",
        imageUrl: img("biblioteca-materiais", "03-materiais.webp"),
        imageAlt: "Lista de materiais de estudo gerados",
        capture: { url: "/materiais", waitFor: "h1:has-text(\"Materiais\")" }
      }
    ]
  },
  {
    slug: "compartilhar-bloco",
    title: "Compartilhar um bloco de questões",
    description: "Gere um link público para qualquer bloco de questões que você criou.",
    icon: "ti-share",
    ctaLabel: "Abrir biblioteca",
    ctaUrl: "/biblioteca",
    displayOrder: 6,
    steps: [
      {
        order: 1,
        title: "Abra o bloco e clique em Compartilhar",
        body: "Dentro de qualquer bloco de questões na Biblioteca, o botão **Compartilhar** fica no topo da tela. Funciona como no Google Docs: um clique já gera o link, sem precisar salvar nada antes.",
        imageUrl: img("compartilhar-bloco", "01-botao-compartilhar.webp"),
        imageAlt: "Botão Compartilhar no topo de um bloco de questões",
        capture: {
          url: "/biblioteca?setId=:chatQuestionSetId",
          selector: '[data-testid="question-set-toolbar"]',
          waitFor: '[data-testid="question-set-toolbar"]'
        }
      },
      {
        order: 2,
        title: "Copie o link e envie",
        body: "Qualquer pessoa com o link vê a primeira questão sem precisar de conta; quem criar uma conta consegue responder o bloco inteiro. Você pode revogar o link a qualquer momento — quem já tinha o link perde o acesso na hora.",
        imageUrl: img("compartilhar-bloco", "02-link-gerado.webp"),
        imageAlt: "Modal com o link de compartilhamento gerado",
        capture: {
          url: "/biblioteca?setId=:chatQuestionSetId",
          click: 'button:has-text("Compartilhar")',
          // Texto do título (ver ShareLinkModal `title` em biblioteca/page.tsx) em vez de só
          // `[role="dialog"]`: se o popup de anúncio reabrir por acaso nesse meio-tempo, ele
          // também tem role="dialog" — o texto garante que é o modal certo sendo recortado.
          selector: '[role="dialog"]:has-text("Compartilhar bloco de questões")',
          waitFor: '[role="dialog"]:has-text("Compartilhar bloco de questões")'
        }
      }
    ]
  },
  {
    slug: "perfil",
    title: "Perfil e preferências",
    description: "Dados cadastrais, estados de interesse e meta diária de questões.",
    icon: "ti-user",
    ctaLabel: "Abrir meu perfil",
    ctaUrl: "/perfil",
    displayOrder: 7,
    steps: [
      {
        order: 1,
        title: "Complete seus dados cadastrais",
        body: "CPF, telefone e data de nascimento ficam em Perfil. O CPF só é pedido quando necessário para emitir cobrança — nada disso é obrigatório para usar o chat ou responder questões.",
        imageUrl: img("perfil", "01-dados-cadastrais.webp"),
        imageAlt: "Formulário de dados cadastrais no perfil",
        capture: { url: "/perfil", selector: "#dados-pessoais", waitFor: "#dados-pessoais" }
      },
      {
        order: 2,
        title: "Estados de interesse e meta diária",
        body: "Selecione os estados dos concursos que você está de olho — a IA usa isso para alinhar exemplos, legislação estadual e editais à sua região. A **meta diária de questões** aparece no painel e ajuda a manter a constância.",
        imageUrl: img("perfil", "02-preferencias-de-estudo.webp"),
        imageAlt: "Seleção de estados de interesse e meta diária de questões",
        capture: { url: "/perfil", selector: "#preferencias", waitFor: "#preferencias" }
      }
    ]
  },
  {
    slug: "assinatura",
    title: "Assinatura e planos",
    description: "Sua cota de uso da IA e como comparar os planos disponíveis.",
    icon: "ti-credit-card",
    ctaLabel: "Ver planos",
    ctaUrl: "/pricing",
    displayOrder: 8,
    steps: [
      {
        order: 1,
        title: "Acompanhe sua cota de uso",
        body: "Seu plano atual, o limite de uso da IA e quando ele renova aparecem em Perfil, na seção **Assinatura**. Cada plano tem um teto diferente de questões por mês e de questões em cada bloco gerado.",
        imageUrl: img("assinatura", "01-cota-de-uso.webp"),
        imageAlt: "Card com o plano ativo e o uso de IA do dia",
        capture: { url: "/perfil", selector: "#assinatura", waitFor: "#assinatura" }
      },
      {
        order: 2,
        title: "Compare os planos",
        body: "Precisa de mais questões por mês ou blocos maiores? A página de planos compara o que cada um libera lado a lado — o upgrade entra em vigor na hora, sem perder o histórico.",
        imageUrl: img("assinatura", "02-planos.webp"),
        imageAlt: "Página de comparação de planos",
        capture: { url: "/pricing", waitFor: "h2" }
      }
    ]
  }
];
