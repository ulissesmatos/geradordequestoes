import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RequestResetForm } from "@/components/password-reset-forms";

export default async function RecuperarSenhaPage() {
  const session = await auth();
  if (session?.user) redirect("/desempenho");

  return <RequestResetForm />;
}
