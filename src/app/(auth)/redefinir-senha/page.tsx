import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export default async function RedefinirSenhaPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/ai");
  const { email } = await searchParams;

  return <ResetPasswordForm defaultEmail={email ?? ""} />;
}
