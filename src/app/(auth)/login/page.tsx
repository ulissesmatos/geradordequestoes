import { AuthForm } from "@/components/auth-form";
import { hasValidSession } from "@/lib/guards";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // Cai no painel, não no chat: é lá que estão a meta do dia, a sequência e a fila de
  // revisão — o que sustenta o hábito de voltar. O chat fica a um clique.
  if (await hasValidSession()) redirect("/desempenho");

  return <AuthForm mode="login" />;
}
