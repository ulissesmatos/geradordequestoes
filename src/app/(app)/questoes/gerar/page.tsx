import { UserGenerateForm } from "@/components/user-generate-form";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function UserGenerateQuestionsPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const subjects = await prisma.subject.findMany({
    include: { topics: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerar questões com IA</h1>
        <p className="text-[var(--muted-foreground)]">
          Crie um bloco personalizado para estudar Certo/Errado na hora.
        </p>
      </div>
      <UserGenerateForm subjects={subjects} />
    </div>
  );
}
