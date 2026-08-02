import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { SaasableAssets } from "@/components/saasable/saasable-assets";
import { getAppSettings } from "@/lib/app-settings";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const appSettings = await getAppSettings();

  return (
    <>
      <SaasableAssets />
      <main className="dm-ready flex min-h-screen flex-col items-center justify-center gap-6 bg-theme-bg-default px-4 py-10">
        <Link href="/">
          <AppLogo lightSrc={appSettings.logoUrl} darkSrc="/brand/logo-white.png" alt={appSettings.appName} className="h-8 w-auto" />
        </Link>
        {children}
      </main>
    </>
  );
}
