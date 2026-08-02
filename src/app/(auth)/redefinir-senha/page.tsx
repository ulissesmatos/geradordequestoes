import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/password-reset-forms";
import { hasValidSession } from "@/lib/guards";

export default async function RedefinirSenhaPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (await hasValidSession()) redirect("/desempenho");
  const { email } = await searchParams;

  return <ResetPasswordForm defaultEmail={email ?? ""} />;
}
