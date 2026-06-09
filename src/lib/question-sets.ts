import {
  AiUsageEventType,
  type Difficulty,
  type QuestionAnswer,
  type QuestionFormat,
  QuestionSetMode,
  QuestionStatus,
  SourceType,
  type User
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateQuestions } from "@/lib/ai/generateQuestions";
import { recordAiUsageEvent } from "@/lib/ai/usage";

export async function generateAndSaveQuestionSet(input: {
  user: Pick<User, "id" | "role">;
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  quantity: number;
  format: QuestionFormat;
  alternativesCount?: number;
  mode: QuestionSetMode;
  prompt: string;
  title?: string;
  chatSessionId?: string;
  context?: string;
}) {
  const [subject, topic] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { id: input.subjectId } }),
    prisma.topic.findUniqueOrThrow({ where: { id: input.topicId } })
  ]);

  const generated = await generateQuestions({
    subject: subject.name,
    topic: topic.name,
    difficulty: input.difficulty,
    quantity: input.quantity,
    format: input.format,
    alternativesCount: input.alternativesCount,
    mode: input.mode,
    prompt: input.prompt,
    context: input.context
  });

  const title = input.title || buildQuestionSetTitle(input.mode, subject.name, topic.name);

  const questionSet = await prisma.questionSet.create({
    data: {
      userId: input.user.id,
      subjectId: input.subjectId,
      topicId: input.topicId,
      chatSessionId: input.chatSessionId,
      title,
      prompt: input.prompt,
      mode: input.mode,
      format: input.format,
      alternativesCount: input.format === "MULTIPLA_ESCOLHA" ? input.alternativesCount ?? 4 : null,
      difficulty: input.difficulty,
      quantity: generated.questions.length,
      aiModel: generated.model,
      questions: {
        create: generated.questions.map((question, index) => ({
          subject: { connect: { id: input.subjectId } },
          topic: { connect: { id: input.topicId } },
          orderInSet: index + 1,
          format: question.format as QuestionFormat,
          statement: question.statement,
          answer: (question.answer ?? null) as QuestionAnswer | null,
          explanation: question.explanation,
          difficulty: question.difficulty as Difficulty,
          status: QuestionStatus.DRAFT,
          sourceType: SourceType.AI,
          aiModel: generated.model,
          createdBy: { connect: { id: input.user.id } },
          options: {
            create: question.options.map((option, optionIndex) => ({
              label: option.label,
              text: option.text,
              isCorrect: option.isCorrect,
              order: optionIndex + 1
            }))
          }
        }))
      }
    },
    include: { questions: { select: { id: true } } }
  });

  await prisma.aiGenerationLog.create({
    data: {
      adminId: input.user.id,
      subjectId: input.subjectId,
      topicId: input.topicId,
      difficulty: input.difficulty,
      quantity: generated.questions.length,
      model: generated.model,
      prompt: generated.prompt,
      status: input.user.role === "ADMIN" ? "SUCCESS" : "USER_SUCCESS"
    }
  });
  await recordAiUsageEvent({
    user: input.user,
    type: AiUsageEventType.QUESTION_GENERATION,
    model: generated.model,
    prompt: generated.prompt
  });

  return questionSet;
}

export function buildQuestionSetTitle(mode: QuestionSetMode, subject: string, topic: string) {
  const modeLabel = {
    [QuestionSetMode.ESTUDO]: "Estudo",
    [QuestionSetMode.SIMULADO]: "Simulado",
    [QuestionSetMode.REVISAO]: "Revisão"
  }[mode];
  return `${modeLabel}: ${subject} / ${topic}`;
}
