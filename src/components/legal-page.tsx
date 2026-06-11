import { marked } from "marked";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type Props = {
  logoUrl: string;
  appName: string;
  title: string;
  markdown: string;
};

/** Renderiza uma página legal (Termos/Privacidade) a partir de Markdown. */
export function LegalPage({ logoUrl, appName, title, markdown }: Props) {
  const html = marked.parse(markdown, { async: false }) as string;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader logoUrl={logoUrl} appName={appName} sticky={false} />
      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <div
          className="prose-legal space-y-4 text-[var(--foreground)]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
      <SiteFooter logoUrl={logoUrl} appName={appName} />
    </main>
  );
}
