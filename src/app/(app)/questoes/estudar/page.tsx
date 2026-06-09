import { redirect } from "next/navigation";

export default async function StudyRedirect({
  searchParams
}: {
  searchParams: Promise<{ setId?: string }>;
}) {
  const params = await searchParams;
  redirect(params.setId ? `/biblioteca?setId=${params.setId}` : "/biblioteca");
}
