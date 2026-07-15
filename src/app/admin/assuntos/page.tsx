import { redirect } from "next/navigation";

// Página unificada com Matérias — mantém a URL antiga funcionando.
export default function AdminTopicsPage() {
  redirect("/admin/materias");
}
