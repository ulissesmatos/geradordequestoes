import { prisma } from "@/lib/prisma";

export function materialTitleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  const withoutCommand = clean.replace(/^(gere|gerar|crie|criar|monte|faça|faca|quero|preciso)\s+(um\s+)?(material|resumo|apostila|conteudo|conteúdo)\s*/i, "");
  if (!withoutCommand) return "Material de estudo";
  return withoutCommand.length > 72 ? `${withoutCommand.slice(0, 69)}...` : withoutCommand;
}

export async function inferMaterialTaxonomy(prompt: string) {
  const normalized = normalizeText(prompt);
  const subjects = await prisma.subject.findMany({
    include: { topics: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });
  const subject = subjects.find((item) => normalized.includes(normalizeText(item.name))) ?? null;
  const topic = subject?.topics.find((item) => normalized.includes(normalizeText(item.name))) ?? null;
  return { subject, topic };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
