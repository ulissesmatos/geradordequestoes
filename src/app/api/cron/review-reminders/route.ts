import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { reviewReminderTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Lembrete diário de revisão espaçada: "você tem N questões vencidas".
 * Roda 1x/dia (agendador externo, sugerido 08:00 BRT). Mesmo esquema de
 * autenticação do subscription-reminders: CRON_SECRET via header
 * `Authorization: Bearer <secret>` ou query `?secret=<secret>`.
 * Idempotente por dia via User.reviewReminderSentAt.
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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Quantas questões vencidas cada usuário tem hoje.
  const dueByUser = await prisma.questionReviewState.groupBy({
    by: ["userId"],
    where: { dueAt: { lte: now } },
    _count: { _all: true }
  });
  if (dueByUser.length === 0) return Response.json({ ok: true, candidates: 0, sent: 0 });

  const users = await prisma.user.findMany({
    where: {
      id: { in: dueByUser.map((row) => row.userId) },
      isBlocked: false,
      reviewReminderOptOut: false,
      OR: [{ reviewReminderSentAt: null }, { reviewReminderSentAt: { lt: todayStart } }]
    },
    select: { id: true, email: true, name: true },
    take: 200
  });

  const dueCountByUser = new Map(dueByUser.map((row) => [row.userId, row._count._all]));
  const appSettings = await getAppSettings();
  const reviewUrl = `${appUrl()}/revisao`;
  let sent = 0;

  for (const user of users) {
    const dueCount = dueCountByUser.get(user.id) ?? 0;
    if (!user.email || dueCount === 0) continue;
    try {
      const tpl = reviewReminderTemplate({
        appName: appSettings.appName,
        firstName: user.name?.trim().split(/\s+/)[0] ?? null,
        dueCount,
        reviewUrl
      });
      const result = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      // Marca como enviado mesmo se o e-mail estiver desabilitado (skipped) para
      // não acumular tentativas; só repete em caso de erro real de envio.
      if (result.ok || ("skipped" in result && result.skipped)) {
        await prisma.user.update({ where: { id: user.id }, data: { reviewReminderSentAt: new Date() } });
        if (result.ok) sent++;
      }
    } catch {
      // ignora este e tenta os demais
    }
  }

  return Response.json({ ok: true, candidates: users.length, sent });
}
