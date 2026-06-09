import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/guards";
import { requireActiveSubscription } from "@/lib/subscriptions";

export default async function ProfilePage() {
  const user = await requireUser();
  await requireActiveSubscription(user);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>{user.email} / {user.role}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
