import { Role } from "@prisma/client";
import { AppNav } from "@/components/app-nav";
import { getAppSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [user, appSettings] = await Promise.all([requireUser(), getAppSettings()]);
  return (
    <>
      <AppNav isAdmin={user.role === Role.ADMIN} logoUrl={appSettings.logoUrl} appName={appSettings.appName} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
