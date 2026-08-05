/**
 * Tetos de tamanho de bloco. Módulo próprio e puro porque o formulário do aluno (componente
 * client) também precisa deles — importar de `generateQuestions.ts` arrastaria o SDK do
 * provedor de IA para o bundle do navegador.
 */
export const QUESTION_LIMITS = {
  /**
   * Teto absoluto por bloco, independente de plano.
   *
   * Acima disso dois problemas crescem juntos: a espera (cada lote é uma chamada sequencial)
   * e a repetição — o contexto de "não repita estes enunciados" vai ficando grande e os
   * últimos lotes perdem qualidade. 50 cobre simulado no formato da banca sem chegar lá.
   */
  maxPerBlock: 50,

  /**
   * Questões por chamada ao modelo.
   *
   * Não é ajuste fino: a geração roda com 4.096 tokens de saída e uma questão Certo/Errado
   * com justificativa custa ~165 tokens de JSON — no nível difícil, com textos de apoio de
   * 2 a 4 parágrafos, um lote de 15 já encosta no limite e o JSON corre risco de truncar.
   * 10 cabe folgado, e ainda deixa o loop de reparo barato (ele regenera o lote inteiro).
   */
  batchSize: 10
} as const;

/**
 * Bloco compartilhado como "só assinantes" (QuestionSetShareVisibility.PAID_ONLY): quantas
 * questões uma conta logada SEM assinatura ainda responde de graça antes do paywall. Vive
 * aqui (não em question-actions.ts) porque tanto o gate no servidor quanto a UI de bloqueio
 * do QuestionRunner precisam do mesmo número.
 */
export const SHARE_PAID_ONLY_FREE_QUESTIONS = 5;

/**
 * Divide o total pedido em lotes, evitando sobra minúscula.
 *
 * Um lote final de 1 ou 2 questões sai pior: o prompt pede estrutura de grupo e bloco de
 * texto de apoio, que não fazem sentido nesse tamanho. Quando a sobra é pequena, ela é
 * distribuída nos lotes anteriores em vez de virar um lote-toco.
 */
export function splitIntoBatches(total: number, batchSize = QUESTION_LIMITS.batchSize): number[] {
  const wanted = Math.max(1, Math.min(total, QUESTION_LIMITS.maxPerBlock));
  if (wanted <= batchSize) return [wanted];

  const fullBatches = Math.floor(wanted / batchSize);
  const remainder = wanted % batchSize;
  // Tipo explícito: `as const` em QUESTION_LIMITS deixaria o array como `10[]` e a
  // distribuição da sobra abaixo não compilaria.
  const batches: number[] = Array.from({ length: fullBatches }, () => batchSize as number);

  if (remainder === 0) return batches;
  // Sobra que vale um lote próprio (>= metade) fica sozinha; senão é diluída.
  if (remainder >= Math.ceil(batchSize / 2)) {
    batches.push(remainder);
    return batches;
  }
  for (let index = 0; index < remainder; index += 1) {
    batches[index % batches.length] += 1;
  }
  return batches;
}
