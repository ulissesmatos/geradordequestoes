import { getAppSettings } from "@/lib/app-settings";
import { getSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * /llms.txt — convenção emergente (llmstxt.org) pra GEO: um resumo em Markdown, pensado
 * pra assistentes de IA lerem em vez de raspar o HTML todo. Complementa o JSON-LD da home
 * (ver StructuredData) e o robots.ts, que já libera os crawlers de IA nas páginas públicas.
 */
export async function GET() {
  const [appSettings, siteUrl] = await Promise.all([getAppSettings(), getSiteUrl()]);

  const content = `# ${appSettings.appName}

> ${appSettings.institutionalText}

Peça questões, simulados ou revisões por chat e a IA monta o material na hora — Certo/Errado
e múltipla escolha, no formato usado pelas bancas de concurso público, consultando provas,
editais e leis reais cadastrados na plataforma.

## Recursos
- Chat AI-first: descreva matéria, formato e dificuldade em linguagem natural e a IA organiza o pedido em um bloco de questões.
- Blocos de questões salvos, para responder na hora ou retomar depois.
- Simulados cronometrados, com nota líquida e correção no padrão da banca.
- Revisão espaçada: quem erra volta no dia seguinte; quem acerta some por intervalos crescentes (3, 7, 16 e 35 dias) até dominar o assunto.
- Certo/Errado e múltipla escolha nativos, escolhidos por bloco.
- Conta grátis com cota de uso renovada mensalmente, sem cartão de crédito.

## Páginas
- [Página inicial](${siteUrl}/): apresentação da plataforma e perguntas frequentes.
- [Planos e preços](${siteUrl}/pricing): comparação de planos e assinatura.
- [Contato](${siteUrl}/contato): fala com a equipe ou plano para empresas.
- [Termos de Uso](${siteUrl}/termos)
- [Política de Privacidade](${siteUrl}/privacidade)

## Observações
- Conteúdo gerado por IA: as questões não são gabarito oficial nem posição de banca examinadora; sempre confira fontes oficiais para informações críticas (editais, datas, legislação).
- Cancelamento: assinaturas por cartão renovam automaticamente até o cancelamento; contratações via Pix valem só pelo prazo contratado. Direito de arrependimento de 7 dias corridos (CDC, art. 49).
`;

  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
