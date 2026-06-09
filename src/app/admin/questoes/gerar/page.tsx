import { GenerateForm } from "@/components/generate-form";
import { prisma } from "@/lib/prisma";

export default async function GenerateQuestionsPage() {
  const subjects = await prisma.subject.findMany({ include: { topics: true }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Geração por IA</h1>
      <GenerateForm subjects={subjects} />
    </div>
  );
}
