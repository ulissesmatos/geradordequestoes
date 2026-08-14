"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MobileNavDrawer, NAV_DESTINATIONS } from "@/components/mobile-nav-drawer";
import { MobileTopBar } from "@/components/mobile-top-bar";

/**
 * Único pedaço client do AppNav: guarda o estado aberto/fechado do drawer e liga
 * MobileTopBar+MobileNavDrawer — o resto do AppNav (logo, nav desktop) continua Server Component.
 * Título do mini-header vem da própria rota, reaproveitando os mesmos 7 destinos do drawer, pra
 * não precisar de nenhuma mudança página por página.
 */
export function AppNavMobile({
  userName,
  isAdmin,
  showUpgrade,
  streak,
  streakActiveToday = false
}: {
  userName: string;
  isAdmin: boolean;
  showUpgrade: boolean;
  streak?: number;
  streakActiveToday?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activeDestination = NAV_DESTINATIONS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const title = activeDestination?.label ?? "Menu";

  return (
    <>
      <MobileTopBar title={title} onOpenMenu={() => setOpen(true)} streak={streak} streakActiveToday={streakActiveToday} />
      <MobileNavDrawer open={open} onClose={() => setOpen(false)} userName={userName} isAdmin={isAdmin} showUpgrade={showUpgrade} />
    </>
  );
}
