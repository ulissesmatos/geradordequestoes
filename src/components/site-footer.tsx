import Image from "next/image";
import Link from "next/link";

type Props = {
  logoUrl?: string;
  appName?: string;
};

/** Footer público reutilizável. */
export function SiteFooter({ logoUrl = "/brand/logo.png", appName = "Gerador de Questões" }: Props) {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted-foreground)] md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <Image src={logoUrl} alt={appName} width={744} height={179} className="h-8 w-auto object-contain" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/pricing" className="hover:text-[var(--foreground)]">Planos</Link>
          <Link href="/contato?empresa=1" className="hover:text-[var(--foreground)]">Planos para empresas</Link>
          <Link href="/contato" className="hover:text-[var(--foreground)]">Contato</Link>
          <Link href="/termos" className="hover:text-[var(--foreground)]">Termos</Link>
          <Link href="/privacidade" className="hover:text-[var(--foreground)]">Privacidade</Link>
          <Link href="/login" className="hover:text-[var(--foreground)]">Entrar</Link>
        </div>
      </div>
    </footer>
  );
}
