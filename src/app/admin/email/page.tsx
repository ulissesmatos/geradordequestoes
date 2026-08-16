import { redirect } from "next/navigation";

// Página unificada em /admin/branding (aba "E-mail") — mantém a URL antiga funcionando.
export default function Page() {
  redirect("/admin/branding?tab=email");
}
