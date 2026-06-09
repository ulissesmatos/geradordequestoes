import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Questões Certo/Errado",
  description: "Plataforma de questões originais para concursos públicos."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
