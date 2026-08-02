import { Role } from "@prisma/client";
import { AppNav } from "@/components/app-nav";
import { AppNavVisibility } from "@/components/app-nav-visibility";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { SaasableAssets } from "@/components/saasable/saasable-assets";
import { getAppSettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/guards";
import { getStreak } from "@/lib/streaks";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [user, appSettings] = await Promise.all([requireUser(), getAppSettings()]);
  const needsEmailVerification = user.role !== Role.ADMIN && !user.emailVerified;
  // Sequência no header de todas as telas do aluno: é o lembrete passivo que mantém o
  // hábito vivo sem precisar de e-mail nem notificação.
  const streak = await getStreak(user.id);
  return (
    <>
      {/* Fontes/ícones da SaasAble aqui, mas layout/densidade das telas do aluno ficam
          como estão — telas de trabalho, não landing page. */}
      <SaasableAssets />
      <div style={{ fontFamily: "figtree, sans-serif" }}>
        <AppNavVisibility>
          <AppNav
            isAdmin={user.role === Role.ADMIN}
            logoUrl={appSettings.logoUrl}
            appName={appSettings.appName}
            streak={streak.current}
            streakActiveToday={streak.activeToday}
          />
          {needsEmailVerification && <EmailVerificationBanner email={user.email} />}
        </AppNavVisibility>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </>
  );
}
