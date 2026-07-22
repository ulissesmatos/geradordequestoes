import { Prisma } from "@prisma/client";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { weeklySummaryTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { countDueReviews } from "@/lib/review";
import { getStreak } from "@/lib/streaks";

export const runtime = "nodejs";

/**
 * Resumo semanal de estudo. O agendador pode chamar DIARIAMENTE: a idempotência
 * semanal (weeklySummarySentAt < segunda-feira 0h da semana corrente) garante
 * no máximo 1 envio por semana, efetivado na segunda (ou no primeiro disparo
 * seguinte). Só envia para quem estudou nos últimos 7 dias e não fez opt-out.
 * Mesmo esquema de auth dos demais crons (CRON_SECRET via Bearer ou ?secret=).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET não configurado." }, { status: 500 });

  const url = new URL(request.url);
  const headerOk = request.headers.get("authorization") === `Bearer ${secret}`;
  const queryOk = url.searchParams.get("secret") === secret;
  if (!headerOk && !queryOk) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Segunda-feira 0h da semana corrente (getDay: 0 = domingo).
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  // Candidatos: estudaram nos últimos 7 dias.
  const active = await prisma.questionAttempt.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: sevenDaysAgo } },
    _count: { _all: true }
  });
  if (active.length === 0) return Response.json({ ok: true, candidates: 0, sent: 0 });

  const users = await prisma.user.findMany({
    where: {
      id: { in: active.map((row) => row.userId) },
      isBlocked: false,
      weeklySummaryOptOut: false,
      OR: [{ weeklySummarySentAt: null }, { weeklySummarySentAt: { lt: weekStart } }]
    },
    select: { id: true, email: true, name: true },
    take: 200
  });

  const appSettings = await getAppSettings();
  const base = appUrl();
  let sent = 0;

  for (const user of users) {
    if (!user.email) continue;
    try {
      const [subjectRows, streak, dueReviews] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string; total: number; correct: number }>>(Prisma.sql`
          SELECT s.name, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE a."isCorrect")::int AS correct
          FROM "QuestionAttempt" a
          JOIN "Question" q ON q.id = a."questionId"
          JOIN "Subject" s ON s.id = q."subjectId"
          WHERE a."userId" = ${user.id} AND a."createdAt" >= ${sevenDaysAgo}
          GROUP BY s.name
        `),
        getStreak(user.id),
        countDueReviews(user.id)
      ]);

      const weekTotal = subjectRows.reduce((acc, row) => acc + row.total, 0);
      if (weekTotal === 0) continue;
      const weekCorrect = subjectRows.reduce((acc, row) => acc + row.correct, 0);
      // Melhor matéria: maior % de acerto entre as com pelo menos 3 tentativas na semana.
      const eligible = subjectRows.filter((row) => row.total >= 3);
      const best = (eligible.length ? eligible : subjectRows)
        .map((row) => ({ name: row.name, accuracy: Math.round((row.correct / row.total) * 100) }))
        .sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;

      const tpl = weeklySummaryTemplate({
        appName: appSettings.appName,
        firstName: user.name?.trim().split(/\s+/)[0] ?? null,
        weekTotal,
        weekAccuracy: Math.round((weekCorrect / weekTotal) * 100),
        bestSubject: best,
        streakDays: streak.current,
        dueReviews,
        reviewUrl: `${base}/revisao`,
        performanceUrl: `${base}/desempenho`
      });
      const result = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      // Marca como enviado mesmo se o e-mail estiver desabilitado (skipped) para
      // não acumular tentativas; só repete em caso de erro real de envio.
      if (result.ok || ("skipped" in result && result.skipped)) {
        await prisma.user.update({ where: { id: user.id }, data: { weeklySummarySentAt: new Date() } });
        if (result.ok) sent++;
      }
    } catch {
      // ignora este e tenta os demais
    }
  }

  return Response.json({ ok: true, candidates: users.length, sent });
}
