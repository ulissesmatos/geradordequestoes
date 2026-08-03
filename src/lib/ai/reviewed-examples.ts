import { QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReviewedExampleQuestion = {
  statement: string;
  supportText: string | null;
  answer: string | null;
  explanation: string;
  options: { label: string; text: string; isCorrect: boolean }[];
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const EXAMPLE_SELECT = {
  statement: true,
  supportText: true,
  answer: true,
  explanation: true,
  options: { select: { label: true, text: true, isCorrect: true }, orderBy: { order: "asc" as const } }
};

/**
 * Questões deste assunto já aprovadas por um humano (Question.reviewedById gravado por
 * reviewQuestionAction, em /admin/questoes ou /admin/questoes/revisar) — servem de exemplo de
 * calibração na geração: o modelo vê, no próprio prompt, texto/gabarito/justificativa já
 * validados por uma pessoa para o mesmo tema, em vez de só instrução abstrata de estilo.
 *
 * Sorteia de um pool maior em vez de sempre pegar as `limit` mais recentes — mesmo motivo de
 * getReferenceContext (src/lib/reference.ts): sem isso, a IA veria sempre os mesmos exemplares
 * a cada chamada. Assunto ainda sem revisão suficiente alarga a busca pra matéria inteira em
 * vez de ficar sem nenhum exemplo (cold start é esperado logo depois desta feature nascer).
 */
export async function getReviewedExampleQuestions(input: {
  subjectId: string;
  topicId: string;
  limit?: number;
}): Promise<ReviewedExampleQuestion[]> {
  const limit = input.limit ?? 3;
  const pool = Math.min(limit * 4, 20);
  const baseWhere = { status: QuestionStatus.APPROVED, reviewedById: { not: null } };

  let candidates = await prisma.question.findMany({
    where: { ...baseWhere, topicId: input.topicId },
    select: EXAMPLE_SELECT,
    orderBy: { createdAt: "desc" },
    take: pool
  });

  if (candidates.length < limit) {
    candidates = await prisma.question.findMany({
      where: { ...baseWhere, subjectId: input.subjectId },
      select: EXAMPLE_SELECT,
      orderBy: { createdAt: "desc" },
      take: pool
    });
  }

  return shuffle(candidates).slice(0, limit);
}

/** Formata os exemplares revisados como bloco de contexto para o prompt de geração. */
export function formatReviewedExamplesContext(questions: ReviewedExampleQuestion[]): string {
  if (questions.length === 0) return "";
  const body = questions
    .map((question, index) => {
      const gabarito = question.answer ?? question.options.find((option) => option.isCorrect)?.label ?? "não informado";
      return [
        `[Exemplo revisado ${index + 1}] (gabarito: ${gabarito})`,
        question.supportText ? `Texto de apoio:\n${question.supportText}\n` : "",
        question.statement,
        question.options.length > 0
          ? question.options.map((option) => `${option.label}) ${option.text}${option.isCorrect ? " [correta]" : ""}`).join("\n")
          : "",
        `Justificativa: ${question.explanation}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  return `QUESTÕES DESTE ASSUNTO JÁ REVISADAS POR UM HUMANO (gabarito conferido — siga o mesmo padrão de qualidade: a justificativa tem que levar EXATAMENTE à resposta marcada como gabarito, sem nenhuma contradição entre as duas):\n${body}`;
}
