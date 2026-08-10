import {
  AiChatRole,
  Difficulty,
  MockExamStatus,
  QuestionAnswer,
  QuestionFormat,
  QuestionSetMode,
  QuestionStatus,
  Role,
  SourceType,
  SubscriptionStatus
} from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { dayKeyInBrazil, dayKeyToInstant, shiftDayKey } from "@/lib/dates";
import { applyAttemptsToReviewStates } from "@/lib/review";
import { finalizeMockExamSession } from "@/lib/mock-exams";

/**
 * Popula uma conta fictícia com conversa de chat, questões, material, simulado e histórico de
 * tentativas — o suficiente pra fotografar todas as 9 telas do tutorial sem gastar UMA chamada
 * de IA de verdade (o usuário testa o fluxo de IA manualmente, nunca em automação).
 *
 * SÓ RODA LOCAL. Nunca referenciado por `npm run build` nem por `prisma/seed.ts` — esta conta e
 * seus dados fictícios não podem existir em produção.
 */

const DEMO_EMAIL = "demo.tutorial@local.test";
const DEMO_PASSWORD = process.env.TUTORIAL_DEMO_PASSWORD ?? "tutorial-demo-2026";
const DEMO_NAME = "Marina Alves";

async function resetDemoData() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!existing) return;

  const sets = await prisma.questionSet.findMany({ where: { userId: existing.id }, select: { id: true } });
  const setIds = sets.map((s) => s.id);
  if (setIds.length) {
    // MockExam restringe delete de QuestionSet (onDelete: Restrict) — precisa sair primeiro.
    await prisma.mockExam.deleteMany({ where: { questionSetId: { in: setIds } } });
    const questions = await prisma.question.findMany({ where: { questionSetId: { in: setIds } }, select: { id: true } });
    if (questions.length) {
      // Cascateia QuestionOption/QuestionAttempt/QuestionReviewState/FavoriteQuestion/MockExamAnswer.
      await prisma.question.deleteMany({ where: { id: { in: questions.map((q) => q.id) } } });
    }
  }
  // Cascateia QuestionSet, StudyMaterial, AiChatSession/Message, UserSubscription, o que sobrou de tentativas.
  await prisma.user.delete({ where: { id: existing.id } });
}

async function seedDemoUser() {
  return prisma.user.create({
    data: {
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      role: Role.USER,
      emailVerified: new Date(),
      termsAcceptedAt: new Date(),
      // CPF/telefone/estado preenchidos de propósito: sem isso o ProfileCompletionPrompt e o
      // StudyStatesPrompt apareceriam em cima de toda tela do chat/painel nos prints.
      cpf: "52998224725",
      phone: "61999998888",
      birthDate: new Date("1998-05-14T00:00:00Z"),
      preferredStates: ["DF", "GO"],
      dailyQuestionGoal: 20
    }
  });
}

async function seedSubscription(userId: string) {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { slug: "pro" } });
  await prisma.userSubscription.create({
    data: { userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, startsAt: new Date() }
  });
}

async function getTopic(subjectSlug: string) {
  const subject = await prisma.subject.findUniqueOrThrow({ where: { slug: subjectSlug } });
  const topic = await prisma.topic.findFirstOrThrow({ where: { subjectId: subject.id } });
  return { subject, topic };
}

type SeedQuestion = {
  statement: string;
  explanation: string;
  answer: QuestionAnswer;
  difficulty: Difficulty;
};

const CHAT_SET_QUESTIONS: SeedQuestion[] = [
  {
    statement:
      "O uso do acento indicativo de crase em “Cheguei à escola antes das sete horas” está correto, pois há fusão da preposição “a”, exigida pelo verbo “chegar”, com o artigo feminino “a”, que antecede “escola”.",
    explanation: "Correto: “chegar a” rege preposição “a”, e “escola” é substantivo feminino determinado por artigo — há fusão, logo crase.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.MEDIO
  },
  {
    statement: "Na frase “Entreguei o documento à ela”, o emprego da crase está correto, uma vez que “ela” é palavra feminina.",
    explanation: "Errado: pronome pessoal do caso reto não admite artigo, então não há crase antes de “ela”.",
    answer: QuestionAnswer.ERRADO,
    difficulty: Difficulty.MEDIO
  },
  {
    statement:
      "Em “Obedeço às normas da instituição”, a crase é obrigatória, pois o verbo “obedecer” rege a preposição “a” e “normas” é substantivo feminino plural determinado pelo artigo “as”.",
    explanation: "Correto: regência (obedecer a) + artigo feminino plural determinado = crase obrigatória.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.MEDIO
  },
  {
    statement: "A frase “Assistimos à um belo espetáculo ontem” está de acordo com a norma-padrão quanto ao uso da crase.",
    explanation: "Errado: “um” é artigo indefinido masculino, incompatível com o artigo definido feminino que a crase exige à direita.",
    answer: QuestionAnswer.ERRADO,
    difficulty: Difficulty.FACIL
  },
  {
    statement:
      "O verbo “namorar” é transitivo direto; por isso, em “Ele namora a colega de trabalho há dois anos”, não se deve usar crase antes de “colega”, mesmo determinada por artigo feminino.",
    explanation: "Correto: sem preposição regida pelo verbo, o “a” é só artigo — não há fusão preposição+artigo, logo não há crase.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.DIFICIL
  },
  {
    statement: "Em “Fiquei a vontade durante a entrevista”, a ausência do acento grave em “vontade” está correta, pois “à vontade” é locução facultativa quanto à crase.",
    explanation: "Errado: “à vontade” é locução consagrada de uso obrigatório do acento indicativo de crase.",
    answer: QuestionAnswer.ERRADO,
    difficulty: Difficulty.MEDIO
  }
];

const EXAM_SET_QUESTIONS: (SeedQuestion & { subjectSlug: string })[] = [
  {
    subjectSlug: "portugues",
    statement: "Em “Fazem dois anos que não a via”, o verbo “fazer” em sentido de tempo decorrido deveria permanecer na 3ª pessoa do singular — a forma adequada é “Faz dois anos”.",
    explanation: "Correto: verbo “fazer” indicando tempo decorrido é impessoal, sempre na 3ª pessoa do singular.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.MEDIO
  },
  {
    subjectSlug: "portugues",
    statement: "Em “Os candidatos, que chegaram atrasados, não puderam realizar a prova”, as vírgulas indicam que TODOS os candidatos chegaram atrasados — oração subordinada adjetiva explicativa.",
    explanation: "Correto: vírgulas isolando a oração adjetiva tornam a informação válida para todo o conjunto, não uma restrição.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.MEDIO
  },
  {
    subjectSlug: "portugues",
    statement: "O emprego do sinal indicativo de crase em “A partir de amanhã, a loja funcionará à noite” está correto, pois “à noite” é locução adverbial feminina de valor temporal.",
    explanation: "Correto: locuções adverbiais femininas de tempo (à noite, à tarde) recebem crase por uso consagrado.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.FACIL
  },
  {
    subjectSlug: "matematica",
    statement: "Se um produto de R$ 250,00 sofre um desconto de 12%, o novo preço passa a ser R$ 220,00.",
    explanation: "Correto: 250 × 0,88 = 220.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.FACIL
  },
  {
    subjectSlug: "matematica",
    statement: "Em uma prova com 40 questões, um candidato que acertou 85% delas obteve exatamente 35 acertos.",
    explanation: "Errado: 40 × 0,85 = 34 acertos, não 35.",
    answer: QuestionAnswer.ERRADO,
    difficulty: Difficulty.MEDIO
  },
  {
    subjectSlug: "informatica",
    statement: "No Microsoft Word em português, o atalho de teclado Ctrl+L abre a caixa de diálogo “Localizar”.",
    explanation: "Correto: Ctrl+L é o atalho padrão de Localizar no Word em português do Brasil.",
    answer: QuestionAnswer.CERTO,
    difficulty: Difficulty.FACIL
  },
  {
    subjectSlug: "informatica",
    statement: "Um firewall tem como função exclusiva eliminar vírus já instalados em um computador, substituindo a necessidade de um antivírus.",
    explanation: "Errado: firewall controla tráfego de rede (entrada/saída), não remove vírus instalados nem substitui um antivírus.",
    answer: QuestionAnswer.ERRADO,
    difficulty: Difficulty.MEDIO
  }
];

async function createQuestionSet(input: {
  userId: string;
  subjectId: string;
  topicId: string;
  chatSessionId?: string;
  title: string;
  prompt: string;
  mode: QuestionSetMode;
  questions: SeedQuestion[];
}) {
  const set = await prisma.questionSet.create({
    data: {
      userId: input.userId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      chatSessionId: input.chatSessionId,
      title: input.title,
      prompt: input.prompt,
      mode: input.mode,
      format: QuestionFormat.CERTO_ERRADO,
      difficulty: Difficulty.MEDIO,
      quantity: input.questions.length,
      aiModel: "gpt-4.1-mini"
    }
  });

  const created = [];
  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    const question = await prisma.question.create({
      data: {
        subjectId: input.subjectId,
        topicId: input.topicId,
        questionSetId: set.id,
        orderInSet: i + 1,
        format: QuestionFormat.CERTO_ERRADO,
        statement: q.statement,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        status: QuestionStatus.APPROVED,
        sourceType: SourceType.AI,
        aiModel: "gpt-4.1-mini",
        options: {
          create: [
            { label: "C", text: "Certo", isCorrect: q.answer === QuestionAnswer.CERTO, order: 1 },
            { label: "E", text: "Errado", isCorrect: q.answer === QuestionAnswer.ERRADO, order: 2 }
          ]
        }
      },
      include: { options: true }
    });
    created.push(question);
  }
  return { set, questions: created };
}

async function seedStudyMaterial(userId: string, subjectId: string, topicId: string) {
  return prisma.studyMaterial.create({
    data: {
      userId,
      subjectId,
      topicId,
      title: "Resumo: Crase e Regência Verbal",
      prompt: "Resumo rápido sobre crase e regência verbal pra revisar antes das questões",
      aiModel: "gpt-4.1-mini",
      status: "READY",
      content: `## Crase e Regência Verbal

### Quando usar o acento grave (à)
- Fusão da preposição **a** (exigida por um verbo ou nome) com o artigo feminino **a**.
- Locuções adverbiais femininas de tempo, lugar ou modo: **à noite**, **à tarde**, **à vontade**.
- Exemplo: "Cheguei **à** escola" (chegar **a** + **a** escola).

### Quando NÃO usar
- Antes de palavra masculina: "Andei a pé" (nunca "à pé").
- Antes de verbo no infinitivo: "Começou a estudar".
- Antes de artigo indefinido: "Assisti a um espetáculo" (nunca "à um").
- Antes de pronomes pessoais do caso reto: "Entreguei a ela" (nunca "à ela").

### Regência verbal — casos que mais caem em prova
1. **Aspirar** (almejar) → transitivo indireto: "aspira **à** vaga".
2. **Namorar** → transitivo direto, sem preposição: "namora **a** colega" (sem crase, mesmo com artigo).
3. **Obedecer/desobedecer** → transitivo indireto: "obedece **às** normas".
4. **Chegar/ir** → sempre com **a** (não "chegar em"): "chegou **à** cidade".

> Dica de prova: pergunte sempre "o verbo pede preposição **a**?" e "a palavra seguinte é feminina e determinada?". Só há crase quando as duas respostas são sim.`
    }
  });
}

async function seedChat(userId: string, questionSetTitle: { setId: string }, materialId: string) {
  const session = await prisma.aiChatSession.create({
    data: {
      userId,
      title: "Questões de Português — crase e regência",
      titleGeneratedAt: new Date(),
      createdAt: new Date(Date.now() - 12 * 60_000)
    }
  });

  await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.USER,
      content: "Pode gerar 6 questões certo/errado de português sobre crase e regência verbal, nível médio, no estilo Cebraspe?",
      createdAt: new Date(Date.now() - 12 * 60_000)
    }
  });
  await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.ASSISTANT,
      content:
        "Prontinho! Gerei 6 questões de Português sobre crase e regência verbal, nível médio, no estilo Cebraspe. Você pode responder agora mesmo ou guardar o bloco na sua biblioteca para depois.",
      questionSetId: questionSetTitle.setId,
      createdAt: new Date(Date.now() - 11 * 60_000)
    }
  });
  await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.USER,
      content: "Show! Agora eu queria um resumo rápido desse assunto pra revisar antes de responder.",
      createdAt: new Date(Date.now() - 6 * 60_000)
    }
  });
  await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.ASSISTANT,
      content: "Preparei um resumo objetivo de Crase e Regência Verbal com as regras principais e os erros mais comuns em prova.",
      studyMaterialId: materialId,
      createdAt: new Date(Date.now() - 5 * 60_000)
    }
  });

  return session;
}

async function seedMockExam(userId: string, adminId: string, questionSet: { id: string; questions: { id: string }[] }) {
  const exam = await prisma.mockExam.create({
    data: {
      title: "Simulado Demonstração — Conhecimentos Gerais",
      description: "Simulado cronometrado de 60 minutos misturando Português, Matemática e Informática.",
      questionSetId: questionSet.id,
      durationMinutes: 60,
      status: MockExamStatus.PUBLISHED,
      createdById: adminId
    }
  });

  const startedAt = new Date(Date.now() - 50 * 60_000);
  const expiresAt = new Date(startedAt.getTime() + 60 * 60_000);
  const session = await prisma.mockExamSession.create({
    data: { mockExamId: exam.id, userId, startedAt, expiresAt }
  });

  // Deixa a última questão em branco de propósito — resultado mais realista que 100% respondido.
  const answered = questionSet.questions.slice(0, -1);
  await prisma.mockExamAnswer.createMany({
    data: [
      ...answered.map((q, i) => ({
        sessionId: session.id,
        questionId: q.id,
        userAnswer: i % 4 === 3 ? QuestionAnswer.ERRADO : QuestionAnswer.CERTO
      })),
      { sessionId: session.id, questionId: questionSet.questions.at(-1)!.id, userAnswer: null }
    ]
  });

  await finalizeMockExamSession(session.id);
  return { exam, session };
}

/**
 * Sequência (streak) + gráficos de /desempenho + fila de /revisao.
 *
 * QuestionReviewState nunca é escrito à mão — sempre via applyAttemptsToReviewStates, chamada
 * UMA VEZ POR DIA (em ordem cronológica) porque a função usa um único `at` pra todo o lote e o
 * `correctStreak` de uma pergunta precisa enxergar o dia anterior antes do seguinte.
 */
async function seedAttemptHistory(
  userId: string,
  questionPool: { id: string; answer: QuestionAnswer | null; subjectSlug: string }[],
  reviewAnchorQuestions: { id: string; answer: QuestionAnswer | null; subjectSlug: string }[]
) {
  const today = dayKeyInBrazil();
  const rng = mulberry32(20260810);

  const byDay = new Map<string, { questionId: string; isCorrect: boolean; userAnswer: QuestionAnswer; createdAt: Date }[]>();
  const pushAttempt = (offset: number, questionId: string, isCorrect: boolean) => {
    const dayKey = shiftDayKey(today, -offset);
    const base = dayKeyToInstant(dayKey).getTime();
    const createdAt = new Date(base + Math.floor(8 + rng() * 12) * 3_600_000); // entre 8h e 20h
    const question = questionPool.find((q) => q.id === questionId)!;
    const correctAnswer = question.answer ?? QuestionAnswer.CERTO;
    const userAnswer = isCorrect ? correctAnswer : correctAnswer === QuestionAnswer.CERTO ? QuestionAnswer.ERRADO : QuestionAnswer.CERTO;
    const list = byDay.get(dayKey) ?? [];
    list.push({ questionId, isCorrect, userAnswer, createdAt });
    byDay.set(dayKey, list);
  };

  // Âncoras da fila de /revisao: recebidas de fora, escolhidas pra nunca serem tocadas de novo
  // por outro caminho (o simulado, por exemplo) — se fossem, o reatacar recalcularia o dueAt
  // pra frente e o item sumiria da fila de "devido hoje" só por acaso.
  const reviewAnchors = [
    { question: reviewAnchorQuestions[0], offset: 4, isCorrect: false },
    { question: reviewAnchorQuestions[1], offset: 5, isCorrect: true }
  ];
  const anchorIds = new Set(reviewAnchors.map((a) => a.question.id));
  const randomPool = questionPool.filter((q) => !anchorIds.has(q.id));

  const informatica = randomPool.filter((q) => q.subjectSlug === "informatica");
  const outros = randomPool.filter((q) => q.subjectSlug !== "informatica");

  // Últimos 6 dias (0..5) garantidos, pra sequência = 6 e activeToday = true.
  for (let offset = 0; offset <= 5; offset++) {
    const hits = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < hits; i++) {
      const fromInformatica = rng() < 0.35;
      const pool = fromInformatica ? informatica : outros;
      const question = pool[Math.floor(rng() * pool.length)];
      const isCorrect = fromInformatica ? rng() < 0.35 : rng() < 0.8;
      pushAttempt(offset, question.id, isCorrect);
    }
  }

  // Histórico mais esparso até 29 dias atrás, pra alimentar os gráficos dos últimos 30 dias.
  for (let offset = 6; offset <= 29; offset++) {
    if (rng() < 0.45) continue;
    const hits = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < hits; i++) {
      const fromInformatica = rng() < 0.35;
      const pool = fromInformatica ? informatica : outros;
      const question = pool[Math.floor(rng() * pool.length)];
      const isCorrect = fromInformatica ? rng() < 0.35 : rng() < 0.8;
      pushAttempt(offset, question.id, isCorrect);
    }
  }

  // Gatilhos garantidos de /revisao "devido hoje": erro empurra dueAt pra +1 dia, acerto pro
  // 1º intervalo (+3 dias) — ver computeNextReviewState em src/lib/review.ts.
  for (const anchor of reviewAnchors) pushAttempt(anchor.offset, anchor.question.id, anchor.isCorrect);

  const days = [...byDay.keys()].sort(); // cronológico: correctStreak de cada dia depende do anterior
  let totalAttempts = 0;
  for (const day of days) {
    const attempts = byDay.get(day)!;
    const at = attempts[0].createdAt;
    await prisma.questionAttempt.createMany({
      data: attempts.map((a) => ({
        userId,
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        userAnswerText: a.userAnswer === QuestionAnswer.CERTO ? "Certo" : "Errado",
        isCorrect: a.isCorrect,
        timeSpentSeconds: 15 + Math.floor(rng() * 75),
        createdAt: a.createdAt
      }))
    });
    await applyAttemptsToReviewStates(userId, attempts.map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect })), at);
    totalAttempts += attempts.length;
  }
  return totalAttempts;
}

/** PRNG determinístico — mesma seed sempre gera o mesmo histórico, útil pra reprodutibilidade local. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log("Limpando dados demo anteriores (se houver)…");
  await resetDemoData();

  console.log("Criando usuário demo…");
  const user = await seedDemoUser();
  await seedSubscription(user.id);

  const admin = await prisma.user.findFirstOrThrow({ where: { role: Role.ADMIN }, select: { id: true } });

  const portugues = await getTopic("portugues");
  const matematica = await getTopic("matematica");
  const informatica = await getTopic("informatica");
  const subjectSlugById = new Map<string, string>([
    [portugues.subject.id, "portugues"],
    [matematica.subject.id, "matematica"],
    [informatica.subject.id, "informatica"]
  ]);

  console.log("Criando bloco de questões do chat…");
  const chatSet = await createQuestionSet({
    userId: user.id,
    subjectId: portugues.subject.id,
    topicId: portugues.topic.id,
    title: "Crase e regência verbal",
    prompt: "6 questões certo/errado de português sobre crase e regência verbal, nível médio",
    mode: QuestionSetMode.ESTUDO,
    questions: CHAT_SET_QUESTIONS
  });

  console.log("Criando bloco de questões do simulado…");
  const examTopicBySlug: Record<string, { subject: { id: string }; topic: { id: string } }> = {
    portugues,
    matematica,
    informatica
  };
  const examSet = await prisma.questionSet.create({
    data: {
      userId: user.id,
      subjectId: portugues.subject.id,
      topicId: portugues.topic.id,
      title: "Simulado — Conhecimentos Gerais",
      prompt: "Simulado de 60 minutos com Português, Matemática e Informática",
      mode: QuestionSetMode.SIMULADO,
      format: QuestionFormat.CERTO_ERRADO,
      difficulty: Difficulty.MEDIO,
      quantity: EXAM_SET_QUESTIONS.length,
      aiModel: "gpt-4.1-mini"
    }
  });
  const examQuestions = [];
  for (let i = 0; i < EXAM_SET_QUESTIONS.length; i++) {
    const q = EXAM_SET_QUESTIONS[i];
    const { subject, topic } = examTopicBySlug[q.subjectSlug];
    const question = await prisma.question.create({
      data: {
        subjectId: subject.id,
        topicId: topic.id,
        questionSetId: examSet.id,
        orderInSet: i + 1,
        format: QuestionFormat.CERTO_ERRADO,
        statement: q.statement,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        status: QuestionStatus.APPROVED,
        sourceType: SourceType.AI,
        aiModel: "gpt-4.1-mini",
        options: {
          create: [
            { label: "C", text: "Certo", isCorrect: q.answer === QuestionAnswer.CERTO, order: 1 },
            { label: "E", text: "Errado", isCorrect: q.answer === QuestionAnswer.ERRADO, order: 2 }
          ]
        }
      },
      include: { options: true }
    });
    examQuestions.push(question);
  }

  console.log("Criando material de estudo…");
  const material = await seedStudyMaterial(user.id, portugues.subject.id, portugues.topic.id);

  console.log("Vinculando bloco do chat à sessão e criando conversa…");
  const chatSession = await seedChat(user.id, { setId: chatSet.set.id }, material.id);
  await prisma.questionSet.update({ where: { id: chatSet.set.id }, data: { chatSessionId: chatSession.id } });

  console.log("Marcando favoritos…");
  await prisma.favoriteQuestion.createMany({
    data: [chatSet.questions[0], chatSet.questions[2]].map((q) => ({ userId: user.id, questionId: q.id }))
  });

  console.log("Semeando histórico de tentativas (sequência, desempenho, revisão)…");
  const pool = [...chatSet.questions, ...examQuestions].map((q) => ({
    id: q.id,
    answer: q.answer,
    subjectSlug: subjectSlugById.get(q.subjectId) ?? "portugues"
  }));
  // Âncoras da fila de revisão: a de Informática é a MESMA questão deixada em branco no
  // simulado (ver seedMockExam) — nunca ganha uma tentativa hoje por esse caminho. A de
  // Português vem do bloco do chat, que o simulado nunca toca.
  const blankExamQuestion = examQuestions.at(-1)!;
  const reviewAnchorQuestions = [
    pool.find((q) => q.id === blankExamQuestion.id)!,
    pool.find((q) => q.id === chatSet.questions[1].id)!
  ];
  const totalAttempts = await seedAttemptHistory(user.id, pool, reviewAnchorQuestions);

  console.log("Criando e finalizando simulado…");
  await seedMockExam(user.id, admin.id, { id: examSet.id, questions: examQuestions });

  console.log("\nPronto.");
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Tentativas semeadas (fora do simulado): ${totalAttempts}`);
}

main()
  .catch((error) => {
    console.error("FALHOU:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
