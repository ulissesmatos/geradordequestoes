import { Role, TrialUsageKind, UsageKind, UsageMeter } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripNullBytesNullable } from "@/lib/sanitize";
import { getActiveSubscription } from "@/lib/subscriptions";
import { refundUsage, reserveUsage } from "@/lib/usage/ledger";

/**
 * Registra UMA ação de IA que não é geração de questões (chat, material novo, aprofundar
 * seção) em AiGenerationLog — mesma tabela que a geração de questões grava direto em
 * question-sets.ts, e mesma fonte que alimenta /admin/ia (logs, erros) e o dashboard de
 * custo. Não mexe na cota — para isso existe chargeAiAction/reserveUsage.
 */
export async function recordAiGenerationLog(input: {
  user: { id: string; role?: Role };
  kind: UsageKind;
  status?: "SUCCESS" | "USER_SUCCESS" | "ERROR" | "USER_ERROR";
  model?: string;
  subjectId?: string;
  topicId?: string;
  prompt?: string;
  userPrompt?: string;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
}) {
  await prisma.aiGenerationLog.create({
    data: {
      userId: input.user.id,
      kind: input.kind,
      subjectId: input.subjectId,
      topicId: input.topicId,
      model: input.model || "desconhecido",
      // O prompt carrega o material de referência (vindo de PDF) e a resposta do modelo,
      // então é rota comum de byte NUL, que o Postgres rejeita em coluna text.
      prompt: stripNullBytesNullable(input.prompt)?.slice(0, 5000) || "(sem prompt)",
      userPrompt: stripNullBytesNullable(input.userPrompt)?.slice(0, 5000),
      errorMessage: stripNullBytesNullable(input.errorMessage)?.slice(0, 2000),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd ?? undefined,
      status: input.status ?? (input.user.role === Role.ADMIN ? "SUCCESS" : "USER_SUCCESS")
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

export type AiActionCharge = {
  /** Livro-caixa do TRIAL (TrialUsageEvent) — decide se o trial ainda está habilitado. */
  trialEventId: string | null;
  /** Livro-caixa de consumo (UsageLedger), medidor CHAT. */
  ledgerId: string | null;
};

/**
 * Cobra UMA ação de IA que não é geração de questões: mensagem de chat, material novo,
 * aprofundar seção.
 *
 * Escreve nos DOIS livros-caixa: TrialUsageEvent (só conta pra quem está no trial, controla
 * `getTrialStatus`) e UsageLedger (mede e, com `usageEnforcementEnabled` ligado, bloqueia).
 *
 * O medidor usado é CHAT, nunca QUESTIONS. É isso que permite ao funil de geração cobrar
 * separadamente sem cobrar a mesma mensagem duas vezes.
 */
export async function chargeAiAction(input: {
  user: { id: string; role?: Role };
  kind: TrialUsageKind;
  ledgerKind: UsageKind;
}): Promise<AiActionCharge> {
  const trialEventId = await chargeTrialUsage({ user: input.user, kind: input.kind });
  try {
    const ledgerId = await reserveUsage({
      user: input.user,
      meter: UsageMeter.CHAT,
      kind: input.ledgerKind,
      units: 1
    });
    return { trialEventId, ledgerId };
  } catch (error) {
    // Recusado pela cota nova: desfaz a cobrança do livro antigo para o usuário não perder
    // crédito por uma ação que nunca aconteceu.
    await refundTrialUsage(trialEventId);
    throw error;
  }
}

/** Estorna a ação nos dois livros. Best-effort, nunca lança. */
export async function refundAiAction(charge: AiActionCharge | null) {
  if (!charge) return;
  await refundTrialUsage(charge.trialEventId);
  await refundUsage(charge.ledgerId);
}
