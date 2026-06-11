import { SubscriptionStatus } from "@prisma/client";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { subscriptionExpiringTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Lembrete de expiração de acesso (Pix, prazo fixo). Roda diariamente.
 * Protegido por CRON_SECRET. Aceita o segredo de duas formas (compatível com
 * qualquer agendador gratuito):
 * - header `Authorization: Bearer <secret>` (GitHub Actions, cron-job.org, Coolify)
 * - query param `?secret=<secret>` (pingers sem header, ex.: UptimeRobot)
 * `reminderSentAt` evita reenvio.
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
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiring = await prisma.userSubscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      reminderSentAt: null,
      endsAt: { gt: now, lte: in3Days }
    },
    include: {
      plan: { select: { name: true } },
      user: { select: { email: true } }
    },
    take: 200
  });

  const appSettings = await getAppSettings();
  const renewUrl = `${appUrl()}/pricing`;
  let sent = 0;

  for (const sub of expiring) {
    if (!sub.user?.email || !sub.endsAt) continue;
    try {
      const tpl = subscriptionExpiringTemplate({
        appName: appSettings.appName,
        planName: sub.plan.name,
        endsAt: sub.endsAt,
        renewUrl
      });
      const result = await sendEmail({ to: sub.user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      // Marca como enviado mesmo se o e-mail estiver desabilitado (skipped) para
      // não acumular tentativas; só repete em caso de erro real de envio.
      if (result.ok || ("skipped" in result && result.skipped)) {
        await prisma.userSubscription.update({ where: { id: sub.id }, data: { reminderSentAt: new Date() } });
        if (result.ok) sent++;
      }
    } catch {
      // ignora este e tenta os demais
    }
  }

  return Response.json({ ok: true, candidates: expiring.length, sent });
}
