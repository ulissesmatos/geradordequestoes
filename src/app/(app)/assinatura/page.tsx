import { Paywall } from "@/components/paywall";
import { requireUser } from "@/lib/guards";

export default async function SubscriptionPage() {
  await requireUser();
  return <Paywall />;
}
