import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { archivo, figtree } from "@/lib/fonts";
import { getAppSettings } from "@/lib/app-settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

/**
 * Baseline compartilhado por todas as páginas — quem quiser um title/description/OG
 * mais específico (ex.: a home em src/app/page.tsx) define seu próprio
 * generateMetadata, que o Next mescla por cima deste default em vez de substituir.
 */
export async function generateMetadata(): Promise<Metadata> {
  const appSettings = await getAppSettings();
  const metadataBase = appSettings.publicUrl ? new URL(appSettings.publicUrl) : undefined;

  return {
    metadataBase,
    title: appSettings.appName,
    description: appSettings.institutionalText,
    icons: {
      icon: appSettings.faviconUrl,
      apple: appSettings.faviconUrl
    },
    openGraph: {
      title: appSettings.appName,
      description: appSettings.institutionalText,
      siteName: appSettings.appName,
      locale: "pt_BR",
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: appSettings.appName,
      description: appSettings.institutionalText
    }
  };
}

export async function generateViewport(): Promise<Viewport> {
  const appSettings = await getAppSettings();
  return { themeColor: appSettings.primaryColor };
}

/**
 * Aplica a classe "dark" ANTES do primeiro paint, sem esperar o React hidratar — senão a
 * tela pisca clara e só escurece depois. Roda de novo a cada mudança do tema do SO (pra
 * quem escolheu "Automático" acompanhar em tempo real) e expõe `__setTheme`, chamada pelo
 * toggle em /perfil para gravar o cookie e re-aplicar na hora, sem precisar recarregar.
 * Preferência fica só no cookie deste navegador (sem sincronizar entre dispositivos).
 */
const THEME_SCRIPT = `(function () {
  function currentPreference() {
    var match = document.cookie.match(/(?:^|; )theme=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "system";
  }
  function apply() {
    var preference = currentPreference();
    var isDark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  }
  window.__setTheme = function (preference) {
    document.cookie = "theme=" + preference + ";path=/;max-age=31536000;samesite=lax";
    apply();
  };
  try {
    apply();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  } catch (error) {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${archivo.variable} ${figtree.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
