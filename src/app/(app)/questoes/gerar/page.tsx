import { UserGenerateForm } from "@/components/user-generate-form";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { resolveGenerationAllowance } from "@/lib/usage/ledger";

export default async function UserGenerateQuestionsPage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const [subjects, allowance] = await Promise.all([
    prisma.subject.findMany({
      include: { topics: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" }
    }),
    resolveGenerationAllowance(user)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerar questões com IA</h1>
        <p className="text-[var(--muted-foreground)]">
          Crie um bloco personalizado para estudar Certo/Errado na hora.
        </p>
      </div>
      <UserGenerateForm subjects={subjects} maxQuantity={allowance.maxPerBlock} capReason={allowance.reason} />
    </div>
  );
}
