/**
 * <link> do design system SaasAble: só fontes (Archivo/Figtree) e ícones Tabler.
 * A paleta/tipografia/`.btn`/`.form-control`/etc. vêm nativamente do nosso Tailwind
 * (ver o bloco @theme em globals.css) — NÃO carregamos mais o style.css compilado do
 * kit aqui. Ele duplicava utilitários padrão do Tailwind (.hidden, .md:flex, ...) numa
 * segunda folha carregada depois da nossa, e como a .hidden dele (sem media query)
 * vinha depois do nosso .md:flex no <head>, ela ganhava a cascata em telas largas —
 * foi isso que sumiu com a sidebar do chat e o menu do AppNav.
 *
 * Renderizar em qualquer página que use SaasableNavbar/SaasableFooter/ícones `ti ti-*`
 * — o Next hoista pro <head> e remove ao navegar pra uma rota que não renderiza isto.
 */
export function SaasableAssets() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap" />
      <link rel="stylesheet" href="/saasable/fonts/tabler-icons.min.css" />
    </>
  );
}
