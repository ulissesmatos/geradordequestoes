import { redirect } from "next/navigation";

// Rota legada: o chat agora vive em /ai. Mantido como redirect por compatibilidade
// com bookmarks e links antigos. Pode ser removido após uma release.
export default async function DashboardRedirectPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const qs = query.toString();
  redirect(qs ? `/ai?${qs}` : "/ai");
}
