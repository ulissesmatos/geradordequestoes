import { prisma } from "@/lib/prisma";

export async function getUserStats(userId: string) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    include: { question: { include: { subject: true, topic: true } } },
    orderBy: { createdAt: "desc" }
  });

  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.isCorrect).length;
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

  const ranked = [...bySubject.values()].sort((a, b) => b.correct / b.total - a.correct / a.total);

  return {
    total,
    accuracy: total ? (correct / total) * 100 : 0,
    best: ranked[0],
    worst: ranked.at(-1),
    recent: attempts.slice(0, 5)
  };
}
