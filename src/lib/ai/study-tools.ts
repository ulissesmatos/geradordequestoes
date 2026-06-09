import { Difficulty, QuestionFormat, QuestionSetMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const studyToolNames = [
  "MOST_MISSED_QUESTIONS",
  "WORST_SUBJECT",
  "SUBJECT_PERFORMANCE",
  "GENERATE_REVIEW_FROM_MISTAKES",
  "RECENT_CORRECT_ANSWERS",
  "FAVORITE_QUESTIONS"
] as const;

export type StudyToolName = (typeof studyToolNames)[number];

export type StudyToolResult =
  | {
      kind: "message";
      message: string;
    }
  | {
      kind: "review_generation";
      subjectId: string;
      topicId: string;
      subjectName: string;
      topicName: string;
      context: string;
      title: string;
    };

type SubjectFilter = {
  id: string;
  name: string;
  normalized: string;
} | null;

export async function runStudyTool(input: {
  userId: string;
  prompt: string;
  toolName: StudyToolName;
}): Promise<StudyToolResult> {
  const subjectFilter = await extractSubjectFilter(input.prompt);

  if (input.toolName === "MOST_MISSED_QUESTIONS") {
    return { kind: "message", message: await getMostMissedQuestions(input.userId, subjectFilter) };
  }

  if (input.toolName === "WORST_SUBJECT") {
    return { kind: "message", message: await getWorstSubject(input.userId) };
  }

  if (input.toolName === "SUBJECT_PERFORMANCE") {
    return { kind: "message", message: await getSubjectPerformance(input.userId, subjectFilter) };
  }

  if (input.toolName === "RECENT_CORRECT_ANSWERS") {
    return { kind: "message", message: await getRecentCorrectAnswers(input.userId, subjectFilter) };
  }

  if (input.toolName === "FAVORITE_QUESTIONS") {
    return { kind: "message", message: await getFavoriteQuestions(input.userId, subjectFilter) };
  }

  return getReviewGenerationTarget(input.userId, subjectFilter);
}

export async function getUserStudySnapshot(userId: string) {
  const [recentSets, recentAttempts, favoritesCount, totalAttempts] = await Promise.all([
    prisma.questionSet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { subject: true, topic: true }
    }),
    prisma.questionAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { question: { include: { subject: true, topic: true } } }
    }),
    prisma.favoriteQuestion.count({ where: { userId } }),
    prisma.questionAttempt.count({ where: { userId } })
  ]);

  const correct = recentAttempts.filter((attempt) => attempt.isCorrect).length;
  const recentAccuracy = recentAttempts.length ? Math.round((correct / recentAttempts.length) * 100) : null;

  return [
    "Resumo breve do usuário no app:",
    `- Tentativas registradas: ${totalAttempts}`,
    recentAccuracy === null ? "" : `- Aproveitamento nas últimas ${recentAttempts.length} tentativas: ${recentAccuracy}%`,
    `- Questões favoritas: ${favoritesCount}`,
    recentSets.length
      ? `- Blocos recentes: ${recentSets
          .map((set) => `${set.title} (${set.quantity} questões, ${set.subject.name} / ${set.topic.name})`)
          .join("; ")}`
      : "- Blocos recentes: nenhum bloco gerado ainda",
    recentAttempts.length
      ? `- Últimas tentativas: ${recentAttempts
          .map((attempt) => `${attempt.isCorrect ? "acerto" : "erro"} em ${attempt.question.subject.name} / ${attempt.question.topic.name}`)
          .join("; ")}`
      : "- Últimas tentativas: nenhuma questão respondida ainda"
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1600);
}

async function getMostMissedQuestions(userId: string, subjectFilter: SubjectFilter) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId, isCorrect: false },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { question: { include: { subject: true, topic: true } } }
  });
  const filtered = filterAttemptsBySubject(attempts, subjectFilter);

  if (filtered.length === 0) {
    return subjectFilter
      ? `Ainda não encontrei erros registrados em ${subjectFilter.name}. Responda algumas questões dessa matéria e eu consigo apontar seus pontos fracos com mais precisão.`
      : "Ainda não encontrei erros registrados no seu histórico. Depois que você responder algumas questões, eu consigo apontar quais itens e temas estão te derrubando mais.";
  }

  const byQuestion = new Map<
    string,
    {
      count: number;
      lastAttemptAt: Date;
      subject: string;
      topic: string;
      statement: string;
    }
  >();

  for (const attempt of filtered) {
    const current = byQuestion.get(attempt.questionId) ?? {
      count: 0,
      lastAttemptAt: attempt.createdAt,
      subject: attempt.question.subject.name,
      topic: attempt.question.topic.name,
      statement: attempt.question.statement
    };
    current.count += 1;
    if (attempt.createdAt > current.lastAttemptAt) current.lastAttemptAt = attempt.createdAt;
    byQuestion.set(attempt.questionId, current);
  }

  const ranked = [...byQuestion.values()]
    .sort((a, b) => b.count - a.count || b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime())
    .slice(0, 6);

  return [
    subjectFilter
      ? `Pelo seu histórico, estes são os pontos em ${subjectFilter.name} em que você mais errou:`
      : "Pelo seu histórico, estas são as questões e temas em que você mais errou:",
    "",
    ...ranked.map(
      (item) =>
        `- **${item.subject} / ${item.topic}** — ${item.count} erro${item.count > 1 ? "s" : ""}\n  ${truncate(item.statement, 180)}`
    ),
    "",
    "Posso usar esses erros para gerar uma revisão direcionada quando você pedir."
  ].join("\n");
}

async function getWorstSubject(userId: string) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 600,
    include: { question: { include: { subject: true } } }
  });

  if (attempts.length === 0) {
    return "Ainda não há tentativas suficientes para apontar sua pior matéria. Responda algumas questões primeiro e eu acompanho seu desempenho daqui.";
  }

  const bySubject = new Map<string, { name: string; total: number; correct: number }>();
  for (const attempt of attempts) {
    const current = bySubject.get(attempt.question.subjectId) ?? {
      name: attempt.question.subject.name,
      total: 0,
      correct: 0
    };
    current.total += 1;
    if (attempt.isCorrect) current.correct += 1;
    bySubject.set(attempt.question.subjectId, current);
  }

  const ranked = [...bySubject.values()]
    .filter((item) => item.total > 0)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)
    .slice(0, 5);

  const worst = ranked[0];
  return [
    `Sua matéria com pior desempenho registrado agora é **${worst.name}**.`,
    "",
    "Ranking das matérias com menor aproveitamento:",
    "",
    ...ranked.map((item) => {
      const accuracy = Math.round((item.correct / item.total) * 100);
      return `- **${item.name}** — ${accuracy}% de acerto (${item.correct}/${item.total})`;
    }),
    "",
    "Se quiser, posso gerar uma revisão focada nessa matéria usando seus erros recentes."
  ].join("\n");
}

async function getSubjectPerformance(userId: string, subjectFilter: SubjectFilter) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 600,
    include: { question: { include: { subject: true, topic: true } } }
  });
  const filtered = filterAttemptsBySubject(attempts, subjectFilter);

  if (filtered.length === 0) {
    return subjectFilter
      ? `Ainda não encontrei tentativas respondidas em **${subjectFilter.name}**. Você já pode gerar um bloco dessa matéria e, depois de responder, eu acompanho seu desempenho aqui.`
      : "Ainda não encontrei tentativas suficientes no seu histórico para medir desempenho. Responda algumas questões e eu passo a acompanhar seus acertos, erros e matérias mais frágeis.";
  }

  const total = filtered.length;
  const correct = filtered.filter((attempt) => attempt.isCorrect).length;
  const accuracy = Math.round((correct / total) * 100);
  const byTopic = new Map<string, { name: string; total: number; correct: number }>();

  for (const attempt of filtered) {
    const current = byTopic.get(attempt.question.topicId) ?? {
      name: attempt.question.topic.name,
      total: 0,
      correct: 0
    };
    current.total += 1;
    if (attempt.isCorrect) current.correct += 1;
    byTopic.set(attempt.question.topicId, current);
  }

  const rankedTopics = [...byTopic.values()]
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)
    .slice(0, 4);
  const label = subjectFilter ? `em **${subjectFilter.name}**` : "no seu histórico geral";

  return [
    `Seu desempenho ${label} está em **${accuracy}% de acerto** (${correct}/${total}).`,
    "",
    accuracy >= 70
      ? "Você está indo bem. Vale manter a prática e subir gradualmente a dificuldade."
      : accuracy >= 50
        ? "Você está no meio do caminho: já tem base, mas ainda há espaço para revisar pontos específicos."
        : "Seu desempenho ainda está baixo nessa área. Eu recomendaria uma revisão guiada antes de subir a dificuldade.",
    "",
    rankedTopics.length ? "Pontos que merecem atenção:" : "",
    "",
    ...rankedTopics.map((item) => {
      const topicAccuracy = Math.round((item.correct / item.total) * 100);
      return `- **${item.name}** — ${topicAccuracy}% de acerto (${item.correct}/${item.total})`;
    }),
    "",
    subjectFilter
      ? `Posso gerar uma revisão de ${subjectFilter.name} baseada nesses dados quando você pedir.`
      : "Se quiser, pergunte por uma matéria específica, como “em Informática, fui bem?”."
  ]
    .filter(Boolean)
    .join("\n");
}

async function getRecentCorrectAnswers(userId: string, subjectFilter: SubjectFilter) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId, isCorrect: true },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: { question: { include: { subject: true, topic: true } } }
  });
  const filtered = filterAttemptsBySubject(attempts, subjectFilter).slice(0, 8);

  if (filtered.length === 0) {
    return subjectFilter
      ? `Ainda não encontrei acertos recentes em ${subjectFilter.name}.`
      : "Ainda não encontrei acertos recentes no seu histórico.";
  }

  return [
    subjectFilter ? `Seus últimos acertos em ${subjectFilter.name}:` : "Seus últimos acertos registrados:",
    "",
    ...filtered.map(
      (attempt) =>
        `- **${attempt.question.subject.name} / ${attempt.question.topic.name}**\n  ${truncate(attempt.question.statement, 170)}`
    )
  ].join("\n");
}

async function getFavoriteQuestions(userId: string, subjectFilter: SubjectFilter) {
  const favorites = await prisma.favoriteQuestion.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { question: { include: { subject: true, topic: true } } }
  });
  const filtered = favorites
    .filter((favorite) => !subjectFilter || normalizeText(favorite.question.subject.name).includes(subjectFilter.normalized))
    .slice(0, 8);

  if (filtered.length === 0) {
    return subjectFilter
      ? `Você ainda não tem questões favoritas em ${subjectFilter.name}.`
      : "Você ainda não tem questões favoritas salvas.";
  }

  return [
    subjectFilter ? `Suas favoritas em ${subjectFilter.name}:` : "Suas questões favoritas mais recentes:",
    "",
    ...filtered.map(
      (favorite) =>
        `- **${favorite.question.subject.name} / ${favorite.question.topic.name}**\n  ${truncate(favorite.question.statement, 170)}`
    )
  ].join("\n");
}

async function getReviewGenerationTarget(userId: string, subjectFilter: SubjectFilter): Promise<StudyToolResult> {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId, isCorrect: false },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: { question: { include: { subject: true, topic: true } } }
  });
  const filtered = filterAttemptsBySubject(attempts, subjectFilter);

  if (filtered.length === 0) {
    return {
      kind: "message",
      message: subjectFilter
        ? `Ainda não encontrei erros em ${subjectFilter.name} para montar uma revisão. Responda algumas questões dessa matéria primeiro.`
        : "Ainda não encontrei erros no seu histórico para montar uma revisão personalizada. Responda algumas questões primeiro e eu uso esses dados para criar um treino bem direcionado."
    };
  }

  const byTopic = new Map<
    string,
    {
      subjectId: string;
      topicId: string;
      subjectName: string;
      topicName: string;
      count: number;
      examples: string[];
    }
  >();

  for (const attempt of filtered) {
    const key = `${attempt.question.subjectId}:${attempt.question.topicId}`;
    const current = byTopic.get(key) ?? {
      subjectId: attempt.question.subjectId,
      topicId: attempt.question.topicId,
      subjectName: attempt.question.subject.name,
      topicName: attempt.question.topic.name,
      count: 0,
      examples: []
    };
    current.count += 1;
    if (current.examples.length < 8) current.examples.push(truncate(attempt.question.statement, 220));
    byTopic.set(key, current);
  }

  const target = [...byTopic.values()].sort((a, b) => b.count - a.count)[0];
  return {
    kind: "review_generation",
    subjectId: target.subjectId,
    topicId: target.topicId,
    subjectName: target.subjectName,
    topicName: target.topicName,
    title: `Revisão: ${target.subjectName} / ${target.topicName}`,
    context: [
      "Crie questões novas e originais para revisar os erros recentes do aluno. Não copie os enunciados abaixo.",
      `Foco principal: ${target.subjectName} / ${target.topicName}`,
      `Erros recentes nesse foco: ${target.count}`,
      "",
      "Exemplos de erros anteriores:",
      ...target.examples.map((example) => `- ${example}`)
    ].join("\n")
  };
}

async function extractSubjectFilter(prompt: string): Promise<SubjectFilter> {
  const normalized = normalizeText(prompt);
  const subjects = await prisma.subject.findMany({ orderBy: { name: "asc" } });
  const subject = subjects.find((item) => normalized.includes(normalizeText(item.name)));
  return subject ? { id: subject.id, name: subject.name, normalized: normalizeText(subject.name) } : null;
}

function filterAttemptsBySubject<
  T extends {
    question: {
      subject: { name: string };
    };
  }
>(attempts: T[], subjectFilter: SubjectFilter) {
  if (!subjectFilter) return attempts;
  return attempts.filter((attempt) => normalizeText(attempt.question.subject.name).includes(subjectFilter.normalized));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

export function reviewDefaults() {
  return {
    difficulty: Difficulty.MEDIO,
    format: QuestionFormat.CERTO_ERRADO,
    mode: QuestionSetMode.REVISAO,
    quantity: 6,
    alternativesCount: 2
  };
}
