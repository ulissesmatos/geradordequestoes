import { redirect } from "next/navigation";

// Página unificada em /admin/auditoria (aba "Erros do navegador") — mantém a URL antiga funcionando.
export default function Page() {
  redirect("/admin/auditoria?tab=erros");
}
