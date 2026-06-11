import { getAiSettings } from "@/lib/ai/settings";

export type WebSearchResult = { title: string; url: string; content: string; publishedDate?: string };

export type WebSearchOutcome =
  | { ok: true; results: WebSearchResult[] }
  | { ok: false; reason: "disabled" | "no_key" | "error"; message: string };

/**
 * Busca na web via Tavily. Degradação segura: se desabilitada ou sem chave,
 * retorna `{ ok:false }` (a tool informa o modelo, sem lançar exceção).
 */
export async function webSearch(query: string, maxResults = 5): Promise<WebSearchOutcome> {
  const settings = await getAiSettings();
  if (!settings.webSearchEnabled) return { ok: false, reason: "disabled", message: "Busca na web desativada." };

  const apiKey = settings.webSearchApiKey || process.env.TAVILY_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_key", message: "Busca na web sem chave configurada." };

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(Math.max(maxResults, 1), 8),
        // "advanced" traz trechos mais relevantes e completos — melhor para reduzir
        // imprecisão/alucinação do modelo (custa mais créditos Tavily que "basic").
        search_depth: "advanced",
        include_answer: false
      })
    });
    if (!response.ok) {
      return { ok: false, reason: "error", message: `Tavily retornou ${response.status}.` };
    }
    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
    };
    const results = (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: (r.content ?? "").slice(0, 800),
      ...(r.published_date ? { publishedDate: r.published_date } : {})
    }));
    return { ok: true, results };
  } catch (error) {
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : "Falha na busca." };
  }
}
