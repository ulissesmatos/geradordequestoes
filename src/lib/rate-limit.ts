/**
 * Rate limiting em memória por janela fixa (fixed window).
 * Sem dependências externas; em ambiente serverless o limite é por instância,
 * o que ainda mitiga rajadas e loops de retry — os limites de custo reais
 * continuam sendo aplicados por assinatura (assertCanGenerateWithAi).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function sweepExpired(now: number) {
  // Limpeza oportunista para o Map não crescer sem limite.
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Consome 1 unidade do limite identificado por `key` (ex.: "chat:<userId>").
 * Retorna ok=false com o tempo de espera quando o limite da janela foi atingido.
 */
export function checkRateLimit(key: string, options: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true };
  }

  if (bucket.count >= options.limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}

export const RATE_LIMITS = {
  /** Mensagens de chat IA por usuário: 10 por minuto. */
  aiChat: { limit: 10, windowMs: 60_000 },
  /** Uploads de anexos por usuário: 20 a cada 5 minutos. */
  uploads: { limit: 20, windowMs: 5 * 60_000 },
  /** "Aprofundar" seção de material por usuário: 6 por minuto (multi-abas/duplo clique). */
  materialExpand: { limit: 6, windowMs: 60_000 },
  /** Erros de JS reportados por IP: 20 por minuto — cobre um navegador preso num loop de erro
   *  sem deixar a tabela crescer sem limite (o próprio reporter também se limita no cliente). */
  clientErrors: { limit: 20, windowMs: 60_000 }
} as const;
