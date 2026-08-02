"use client";

import Image from "next/image";
import { useLayoutEffect, useState } from "react";

/**
 * Troca a logo pela variante branca quando ".dark" está ativa na <html> — reage a
 * "Automático" mudando de sistema, e ao toggle do Perfil, sem precisar de reload.
 * useState(false) começa igual ao servidor (que não sabe o tema) para não gerar
 * mismatch de hidratação; useLayoutEffect corrige antes do primeiro paint do
 * cliente, então não há flash visível mesmo quando o tema resolvido é escuro.
 */
export function AppLogo({
  lightSrc,
  darkSrc,
  alt,
  className
}: {
  lightSrc: string;
  darkSrc: string;
  alt: string;
  className?: string;
}) {
  const [isDark, setIsDark] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Image
      src={isDark ? darkSrc : lightSrc}
      alt={alt}
      width={744}
      height={179}
      className={className}
    />
  );
}
