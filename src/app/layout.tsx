import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gerador de Questões",
  description: "Plataforma AI-first para gerar questões, simulados e revisões para concursos públicos.",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/favicon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
