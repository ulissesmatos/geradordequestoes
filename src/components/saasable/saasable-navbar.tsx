"use client";

import { useState } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

export function SaasableNavbar({
  logoUrl,
  appName,
  isLoggedIn
}: {
  logoUrl: string;
  appName: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="z-50 w-full relative">
      <div className="saasable-container">
        <div className="flex py-4 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <AppLogo lightSrc={logoUrl} darkSrc="/brand/logo-white.png" alt={appName} className="h-8 w-auto lg:h-9" />
          </Link>

          {/* Desktop: pill de links, sempre em fluxo normal — nunca disputa posicionamento com o mobile. */}
          <div className="hidden lg:flex items-center rounded-full bg-theme-bg-default">
            <Link href="/pricing" className="inline-block text-theme-text-primary hover:bg-primary-500/[.04] rounded-full px-[18px] py-3 text-[14px] font-medium transition-all leading-[1.429]">
              Planos
            </Link>
            <Link href="/contato" className="inline-block text-theme-text-primary hover:bg-primary-500/[.04] rounded-full px-[18px] py-3 text-[14px] font-medium transition-all leading-[1.429]">
              Contato
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/ai" className="btn btn-primary">
                Acessar minha conta
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline-primary">
                  Entrar
                </Link>
                <Link href="/register" className="btn btn-primary">
                  Criar conta
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-theme-text-primary rounded-full lg:hidden hover:bg-theme-bg-default"
          >
            <i className={open ? "ti ti-x text-2xl leading-none" : "ti ti-menu-2 text-2xl leading-none"} />
          </button>
        </div>

        {/* Mobile: só existe no DOM quando aberto — sem disputa de classe hidden/flex com o desktop. */}
        {open && (
          <div className="lg:hidden absolute top-full left-0 right-0 z-50 bg-theme-bg-paper rounded-b-3xl shadow-lg px-4 pb-4">
            <div className="flex flex-col">
              <Link href="/pricing" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-[14px] font-medium text-theme-text-primary hover:bg-theme-bg-default">
                Planos
              </Link>
              <Link href="/contato" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-[14px] font-medium text-theme-text-primary hover:bg-theme-bg-default">
                Contato
              </Link>
            </div>
            <div className="flex items-center gap-2 pt-3">
              {isLoggedIn ? (
                <Link href="/ai" onClick={() => setOpen(false)} className="btn btn-primary w-full text-center">
                  Acessar minha conta
                </Link>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="btn btn-outline-primary flex-1 text-center">
                    Entrar
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)} className="btn btn-primary flex-1 text-center">
                    Criar conta
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
