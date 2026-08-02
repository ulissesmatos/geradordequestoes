/**
 * <link> do design system SaasAble: ícones Tabler. Archivo/Figtree são self-hosted via
 * next/font (ver src/lib/fonts.ts, aplicado no <html> do layout raiz), não passam mais
 * por aqui. A paleta/tipografia/`.btn`/`.form-control`/etc. vêm nativamente do nosso
 * Tailwind (ver o bloco @theme em globals.css) — NÃO carregamos o style.css compilado do
 * kit. Ele duplicava utilitários padrão do Tailwind (.hidden, .md:flex, ...) numa
 * segunda folha carregada depois da nossa, e como a .hidden dele (sem media query)
 * vinha depois do nosso .md:flex no <head>, ela ganhava a cascata em telas largas —
 * foi isso que sumiu com a sidebar do chat e o menu do AppNav.
 *
 * Renderizar em qualquer página que use ícones `ti ti-*` — o Next hoista pro <head> e
 * remove ao navegar pra uma rota que não renderiza isto.
 *
 * public/saasable/fonts/tabler-icons.min.css é um SUBCONJUNTO gerado localmente (só os
 * ~38 ícones usados no projeto, de ~5800 no pacote original — 233 KiB → ~2 KiB de CSS,
 * 867 KiB → ~9 KiB de woff2). Ao usar um `ti-xxx` novo que não está nessa lista, ele não
 * vai renderizar (glifo ausente na fonte). Para regenerar: extrair os `ti-[a-z0-9-]+`
 * usados em src/, e rodar `python -m fontTools.subset` no
 * tabler-icons.ttf original (baixe de https://github.com/tabler/tabler-icons) com
 * --unicodes dos codepoints correspondentes, --flavor=woff2.
 */
export function SaasableAssets() {
  return <link rel="stylesheet" href="/saasable/fonts/tabler-icons.min.css" />;
}
