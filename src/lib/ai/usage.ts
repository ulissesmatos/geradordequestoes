import { AiUsageEventStatus, AiUsageEventType, Role, TrialUsageKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripNullBytesNullable } from "@/lib/sanitize";
import { getActiveSubscription } from "@/lib/subscriptions";

/**
 * Registra UMA chamada de IA no log bruto (AiUsageEvent). Continua alimentando /admin/logs-ia e
 * o limite diário dos planos pagos. Não mexe na cota do trial — para isso existe
 * chargeTrialUsage, que conta AÇÕES do usuário em vez de chamadas ao provedor.
 */
export async function recordAiUsageEvent(input: {
  user: { id: string; role?: Role };
  type: AiUsageEventType;
  status?: AiUsageEventStatus;
  model?: string;
  prompt?: string;
  errorMessage?: string;
}) {
  await prisma.aiUsageEvent.create({
    data: {
      userId: input.user.id,
      type: input.type,
      status: input.status ?? AiUsageEventStatus.SUCCESS,
      model: input.model,
      // O prompt carrega o material de referência (vindo de PDF) e a resposta do modelo,
      // então é rota comum de byte NUL, que o Postgres rejeita em coluna text.
      prompt: stripNullBytesNullable(input.prompt)?.slice(0, 5000),
      errorMessage: stripNullBytesNullable(input.errorMessage)?.slice(0, 2000)
    }
  });
}

/**
 * Consome 1 unidade da cota mensal do trial. Chamada APENAS nos pontos de entrada de topo
 * (mensagem de chat, geração pelo formulário, aprofundar material) — nunca em código
 * compartilhado de geração, senão uma mensagem que dispara tools cobraria várias vezes.
 *
 * Cobrado na ENTRADA, logo após o portão liberar, e não no fim: cobrar no fim deixaria
 * requisições concorrentes passarem todas com a contagem ainda zerada (o rate limit de 10/min
 * permitiria ~10 mensagens pagas por nós num limite de 3). Se a ação falhar, quem chamou
 * estorna com refundTrialUsage.
 *
 * Retorna o id da linha criada (para estorno) ou null quando não há o que cobrar
 * (admin ou assinante — o livro-caixa é exclusivo do trial).
 */
export async function chargeTrialUsage(input: {
  user: { id: string; role?: Role };
  kind: TrialUsageKind;
}): Promise<string | null> {
  if (input.user.role === Role.ADMIN) return null;
  const subscription = await getActiveSubscription(input.user.id);
  if (subscription) return null;

  const event = await prisma.trialUsageEvent.create({
    data: { userId: input.user.id, kind: input.kind },
    select: { id: true }
  });
  return event.id;
}

/**
 * Devolve a unidade cobrada quando a ação falhou (erro do provedor, validação, etc.) — o
 * usuário não deve perder crédito por algo que não entregou resultado. Best-effort: falhar o
 * estorno não pode derrubar o tratamento de erro em andamento.
 */
export async function refundTrialUsage(eventId: string | null) {
  if (!eventId) return;
  await prisma.trialUsageEvent.delete({ where: { id: eventId } }).catch(() => undefined);
}
