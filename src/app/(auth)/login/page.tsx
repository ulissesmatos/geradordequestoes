import { AuthForm } from "@/components/auth-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/ai");

  return <AuthForm mode="login" />;
}
