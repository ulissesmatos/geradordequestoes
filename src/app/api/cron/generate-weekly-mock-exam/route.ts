import { generateWeeklyMockExamIfNeeded } from "@/lib/mock-exam-generator";

export const runtime = "nodejs";

/**
 * Simulado semanal auto-gerado (ver src/lib/mock-exam-generator.ts). Idempotente por
 * semana (weekKey) — o agendador pode chamar mais vezes do que uma por semana sem
 * duplicar o simulado, mesmo esquema dos demais crons (CRON_SECRET via Bearer ou
 * ?secret=).
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

  const result = await generateWeeklyMockExamIfNeeded();
  return Response.json({ ok: true, ...result });
}
