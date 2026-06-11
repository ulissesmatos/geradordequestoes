import { GenerateForm } from "@/components/generate-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { prisma } from "@/lib/prisma";

export default async function GenerateQuestionsPage() {
  const subjects = await prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Geração por IA" description="Gere questões em lote com IA para revisão." />
      <GenerateForm subjects={subjects} />
    </div>
  );
}
