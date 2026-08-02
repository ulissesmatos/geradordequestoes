import Link from "next/link";

/**
 * Paráfrase do direito de arrependimento do CDC art. 49 (src/lib/legal-defaults.ts
 * §4.1) — reasseguramento, não um benefício exclusivo da plataforma.
 */
export function SaasableGuaranteeBadge() {
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-center gap-2.5 rounded-full border border-theme-divider bg-theme-bg-default px-5 py-3 text-center">
      <i className="ti ti-shield-check text-primary-500 text-lg leading-none shrink-0" />
      <p className="body2 text-theme-text-secondary">
        Compra sem risco: por lei (CDC, art. 49), você tem 7 dias corridos após a contratação para desistir e pedir
        reembolso integral.{" "}
        <Link href="/termos" className="font-semibold text-primary-500 hover:underline">
          Ver Termos
        </Link>
      </p>
    </div>
  );
}
