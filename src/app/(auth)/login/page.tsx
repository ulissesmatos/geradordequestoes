import { AuthForm } from "@/components/auth-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  // Cai no painel, não no chat: é lá que estão a meta do dia, a sequência e a fila de
  // revisão — o que sustenta o hábito de voltar. O chat fica a um clique.
  if (session?.user) redirect("/desempenho");

  return <AuthForm mode="login" />;
}
