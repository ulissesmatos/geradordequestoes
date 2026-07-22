import { redirect } from "next/navigation";

// Rota legada: hoje aponta para o painel de desempenho.
export default async function DashboardRedirectPage() {
  redirect("/desempenho");
}
