import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Tudo que é área logada/transacional do app — sem valor de busca e só desperdiça crawl
// budget (ou pior, vaza estrutura de rotas privadas nos resultados).
const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/ai",
  "/dashboard",
  "/desempenho",
  "/questoes",
  "/revisao",
  "/simulados",
  "/biblioteca",
  "/materiais",
  "/perfil",
  "/assinatura",
  "/afiliado",
  "/tutorial",
  "/checkout",
  "/cobranca",
  "/login",
  "/register",
  "/recuperar-senha",
  "/redefinir-senha",
  // Links de compartilhamento são conteúdo de usuário, não da plataforma — não indexar.
  "/c/",
  "/q/",
  "/r/"
];

// Crawlers de IA (GEO) explícitos: mesma liberação do "*" nas páginas públicas, listados
// à parte para deixar claro que são bem-vindos e dar um lugar fácil pra divergir no futuro
// (ex.: permitir busca de um mas bloquear treinamento de outro).
const AI_USER_AGENTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "Google-Extended", "PerplexityBot", "CCBot", "Applebot-Extended"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...AI_USER_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE_PATHS }))
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
