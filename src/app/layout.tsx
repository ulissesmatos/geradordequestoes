import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

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
    <html lang="pt-BR" className={inter.variable}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
