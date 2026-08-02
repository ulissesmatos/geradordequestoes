import { Archivo, Figtree } from "next/font/google";

/**
 * Self-hosted via next/font: elimina as 2 requisições bloqueantes a fonts.googleapis.com
 * do design system SaasAble. preload:false porque só uma parte das rotas usa essas
 * classes (.h1-.h6 etc.) — evita forçar o download em rotas que não renderizam texto
 * nessas fontes (ex.: checkout).
 */
export const archivo = Archivo({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
  preload: false
});

export const figtree = Figtree({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-figtree",
  display: "swap",
  preload: false
});
