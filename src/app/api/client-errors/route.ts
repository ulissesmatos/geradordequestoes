import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Tetos generosos o bastante pra um stack trace real, curtos o bastante pra não virar
// vetor de payload gigante — ninguém digita isto, é sempre o navegador que gera.
const payloadSchema = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(500)
});

/**
 * Recebe erros de JavaScript do navegador (ver src/components/client-error-reporter.tsx).
 * Público de propósito — precisa funcionar até pra quem nunca logou (ex.: a página pública
 * de bloco compartilhado) — mas com rate limit por IP pra um navegador preso num loop de
 * erro não inundar a tabela.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkRateLimit(`client-errors:${ip}`, RATE_LIMITS.clientErrors);
  if (!limited.ok) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 204 });

  const { message, stack, url } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? "desconhecido";

  // Best-effort: se não tiver sessão (visitante anônimo, ex. bloco compartilhado), segue sem userId.
  const session = await auth().catch(() => null);

  console.error(`[client-error] ${message} · ${url} · ${userAgent}`);

  await prisma.clientErrorLog
    .create({
      data: { message, stack, url, userAgent, userId: session?.user?.id ?? null }
    })
    .catch((err) => console.error("[client-error] falha ao gravar no banco:", err));

  return new Response(null, { status: 204 });
}
