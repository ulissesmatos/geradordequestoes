import { redirect } from "next/navigation";

// Página unificada em /admin/questoes (aba "Compartilhamentos") — mantém a URL antiga funcionando.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => v != null) as [string, string][]);
  params.set("tab", "compartilhamentos");
  redirect(`/admin/questoes?${params.toString()}`);
}
