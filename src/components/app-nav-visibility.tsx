"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * No chat IA mobile o app ocupa a tela toda (padrão ChatGPT): o header global
 * some e a navegação fica no drawer do próprio chat. Desktop não muda.
 */
export function AppNavVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/ai" || pathname.startsWith("/ai/");
  return <div className={isChat ? "hidden md:block" : undefined}>{children}</div>;
}
