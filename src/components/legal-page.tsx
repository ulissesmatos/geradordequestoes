import { marked } from "marked";
import { auth } from "@/auth";
import { SaasableAssets } from "@/components/saasable/saasable-assets";
import { SaasableFooter } from "@/components/saasable/saasable-footer";
import { SaasableNavbar } from "@/components/saasable/saasable-navbar";

type Props = {
  logoUrl: string;
  appName: string;
  title: string;
  markdown: string;
};

/** Renderiza uma página legal (Termos/Privacidade) a partir de Markdown. */
export async function LegalPage({ logoUrl, appName, title, markdown }: Props) {
  const html = marked.parse(markdown, { async: false }) as string;
  const session = await auth();

  return (
    <>
      <SaasableAssets />
      <main className="dm-ready min-h-screen bg-theme-bg-default text-theme-text-primary">
        <SaasableNavbar logoUrl={logoUrl} appName={appName} isLoggedIn={Boolean(session?.user)} />
        <div className="common-section">
          <article className="saasable-container max-w-3xl">
            <div className="rounded-3xl bg-theme-bg-paper p-6 md:p-10">
              <h1 className="h1 mb-6">{title}</h1>
              <div
                className="prose-legal space-y-4 text-[var(--foreground)]"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </article>
        </div>
        <SaasableFooter logoUrl={logoUrl} appName={appName} />
      </main>
    </>
  );
}
