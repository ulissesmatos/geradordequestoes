import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/guards";
import { getActiveSubscription } from "@/lib/subscriptions";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function ProfilePage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const currentSubscription = await getActiveSubscription(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>{user.email} / {user.role}</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Assinatura</CardTitle>
          <CardDescription>
            {currentSubscription
              ? `${currentSubscription.plan.name} / ${currentSubscription.status}`
              : "Nenhuma assinatura ativa encontrada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/pricing">Ver planos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/checkout/stripe/portal">Gerenciar cartão</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
