import { prisma } from "@/lib/prisma";

export const defaultPlanFeatures = [
  "Até {limit} usos de IA por dia",
  "Chat para gerar questões, simulados, revisões e materiais",
  "Histórico salvo com blocos gerados",
  "Revisão com base em erros e favoritos"
];

export async function getPricingContent() {
  return (
    (await prisma.pricingContent.findUnique({ where: { id: "default" } })) ??
    (await prisma.pricingContent.create({ data: { id: "default" } }))
  );
}

export function planFeatures(plan: { features: string[]; aiGenerationsPerDay: number }) {
  const features = plan.features.length ? plan.features : defaultPlanFeatures;
  return features.map((feature) => feature.replaceAll("{limit}", String(plan.aiGenerationsPerDay)));
}
