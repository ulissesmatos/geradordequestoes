export class AiProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof AiProviderError) return error.status;
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

function isNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network|socket|timed?\s?out|aborted/i.test(message);
}

export function isTransientAiError(error: unknown) {
  const status = errorStatus(error);
  if (status === 429) return true;
  if (status && status >= 500) return true;
  return isNetworkError(error);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 600;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isTransientAiError(error)) throw error;
      const jitter = 0.75 + Math.random() * 0.5;
      const delay = Math.round(baseDelayMs * 2 ** attempt * jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function toFriendlyAiError(error: unknown): string {
  const status = errorStatus(error);
  if (status === 401 || status === 403) {
    return "A chave do provedor de IA está inválida ou sem permissão. Avise o administrador do sistema.";
  }
  if (status === 429) {
    return "O provedor de IA está sobrecarregado no momento. Aguarde alguns segundos e tente reenviar.";
  }
  if (status && status >= 500) {
    return "O provedor de IA está instável agora. Tente reenviar a mensagem.";
  }
  if (isNetworkError(error)) {
    return "Não consegui falar com a IA agora. Verifique a conexão e tente reenviar a mensagem.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Erro ao processar sua mensagem. Tente novamente.";
}
