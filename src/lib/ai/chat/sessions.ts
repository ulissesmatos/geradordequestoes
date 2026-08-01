import { getAiSettings } from "@/lib/ai/settings";
import { completeChat } from "@/lib/ai/chat/provider";
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

/**
 * Título imediato, por corte do próprio prompt. Continua sendo o que aparece no primeiro
 * instante e o fallback quando a IA falha — a lista nunca fica vazia esperando.
 */
export function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "Novo chat";
  const withoutCommand = clean.replace(/^(gere|crie|faça|faca|monte|quero|preciso)\s+/i, "");
  return withoutCommand.length > 48 ? `${withoutCommand.slice(0, 45)}...` : withoutCommand;
}

const MAX_TITLE_LENGTH = 42;

/**
 * Reescreve o título da sessão com a IA, a partir do primeiro pedido do usuário.
 *
 * Por que existe: o título por corte de string produzia lista ruim — dois pedidos parecidos
 * viravam "Gerar 10 questões de Dir..." e "Gerar 10 questões de Dir...", indistinguíveis, e o
 * corte caía no meio da palavra que diferenciava os dois.
 *
 * Roda em PARALELO ao turno, não antes dele. Fazer a primeira chamada ser a do título
 * atrasaria a resposta de todo chat novo em ~1s para melhorar um texto da barra lateral —
 * troca ruim. O título entra assim que fica pronto.
 *
 * Best-effort: qualquer falha mantém o título por corte, que já está gravado.
 */
export async function generateSessionTitle(sessionId: string, prompt: string): Promise<void> {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length < 12) return;

  const session = await prisma.aiChatSession.findUnique({
    where: { id: sessionId },
    select: { titleGeneratedAt: true }
  });
  // Só o PRIMEIRO pedido nomeia a conversa: renomear a cada mensagem faria o item pular de
  // nome na barra lateral enquanto a pessoa conversa.
  if (!session || session.titleGeneratedAt) return;

  const settings = await getAiSettings();
  if (!settings.apiKey) return;

  const result = await completeChat({
    settings,
    messages: [
      {
        role: "system",
        content: `Você nomeia conversas de um app de estudos para concursos. Devolva APENAS o título, sem aspas, sem ponto final e sem prefixo. Máximo de ${MAX_TITLE_LENGTH} caracteres. Use a matéria e o assunto quando aparecerem no pedido, porque é o que diferencia uma conversa da outra na lista. Não comece com verbo de comando ("Gerar", "Criar"): prefira o tema. Exemplos: "Crase em Português", "Simulado de Constitucional", "Revisão dos erros de Informática".`
      },
      { role: "user", content: clean.slice(0, 500) }
    ],
    maxOutputTokens: 30
  }).catch(() => null);

  if (!result || result.kind !== "text") return;

  const title = result.text.replace(/^["'\s]+|["'\s.]+$/g, "").replace(/\s+/g, " ").trim();
  if (!title) return;

  await prisma.aiChatSession
    .update({
      where: { id: sessionId },
      data: {
        title: title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title,
        titleGeneratedAt: new Date()
      }
    })
    .catch(() => undefined);
}
