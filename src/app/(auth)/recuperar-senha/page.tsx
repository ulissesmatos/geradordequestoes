import { redirect } from "next/navigation";
import { RequestResetForm } from "@/components/password-reset-forms";
import { hasValidSession } from "@/lib/guards";

export default async function RecuperarSenhaPage() {
  if (await hasValidSession()) redirect("/desempenho");

  return <RequestResetForm />;
}
