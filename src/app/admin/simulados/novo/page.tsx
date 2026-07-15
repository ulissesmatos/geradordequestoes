import { TeamAccountStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { MockExamCreateForm } from "@/components/admin/mock-exam-create-form";
import { getModelOptionsForProvider } from "@/lib/ai/model-catalog";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";
import { prisma } from "@/lib/prisma";

export default async function NewMockExamPage() {
  const [subjects, teams, aiSettings] = await Promise.all([
    prisma.subject.findMany({ include: { topics: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.teamAccount.findMany({
      where: { status: TeamAccountStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    getAiSettings()
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Novo simulado"
        description="As questões são geradas por IA e o simulado nasce como rascunho — revise o gabarito antes de publicar."
      />
      <MockExamCreateForm
        subjects={subjects.map((s) => ({ id: s.id, name: s.name, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) }))}
        teams={teams}
        providerName={providerLabel(aiSettings.provider)}
        defaultModel={aiSettings.model}
        modelOptions={getModelOptionsForProvider(aiSettings.provider)}
      />
    </div>
  );
}
