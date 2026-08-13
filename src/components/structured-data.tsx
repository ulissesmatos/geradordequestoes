/**
 * JSON-LD genérico (Organization, SoftwareApplication, FAQPage, ...) — Google e os
 * crawlers de IA (GEO) usam isso pra entender a página sem precisar inferir do HTML/CSS.
 * `data` já deve estar no formato final do schema.org; ver app/page.tsx para o grafo usado.
 */
export function StructuredData({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
