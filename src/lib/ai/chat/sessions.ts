import { prisma } from "@/lib/prisma";

export async function getOrCreateChatSession(userId: string, prompt: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId },
      include: { _count: { select: { messages: true } } }
    });
    if (existing) {
      if (existing._count.messages === 0 || existing.title === "Novo chat") {
        await prisma.aiChatSession.update({
          where: { id: existing.id },
          data: { title: titleFromPrompt(prompt) }
        });
      }
      return existing;
    }
  }

  return prisma.aiChatSession.create({
    data: { userId, title: titleFromPrompt(prompt) }
  });
}

export function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "Novo chat";
  const withoutCommand = clean.replace(/^(gere|crie|faça|faca|monte|quero|preciso)\s+/i, "");
  return withoutCommand.length > 48 ? `${withoutCommand.slice(0, 45)}...` : withoutCommand;
}
