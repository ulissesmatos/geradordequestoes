import { redirect } from "next/navigation";

// Página unificada em /admin/ia (abas "Logs de geração" / "Tool calls" / "Erros de uso") — mantém a URL antiga funcionando.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => v != null) as [string, string][]);
  if (!params.get("tab")) params.set("tab", "generation");
  redirect(`/admin/ia?${params.toString()}`);
}
