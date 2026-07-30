/**
 * Saneamento de texto antes de gravar no Postgres.
 *
 * Postgres REJEITA o byte NUL (0x00) em colunas text/varchar — a gravação falha inteira com
 * `invalid byte sequence for encoding "UTF8": 0x00` (SQLSTATE 22021). O byte chega por dois
 * caminhos reais aqui: texto extraído de PDF (unpdf devolve NUL em PDFs com fontes/streams
 * problemáticos) e resposta de LLM, que às vezes emite o escape de NUL no JSON — inclusive
 * ecoando um NUL que veio do material de referência colocado no prompt.
 *
 * Sem isso, um único NUL derrubava a criação do bloco de questões inteiro, e o erro cru de
 * banco chegava ao aluno como "falha de codificação no sistema".
 *
 * Os padrões são montados com String.fromCharCode de propósito: caractere de controle escrito
 * literalmente no código-fonte é invisível no editor e sobrevive a copiar/colar sem ninguém notar.
 */

const NUL = String.fromCharCode(0);

/**
 * Controles C0 exceto tab (0x09), LF (0x0A) e CR (0x0D), que são quebras legítimas.
 * Inclui também os não-caracteres 0xFFFE/0xFFFF, comuns em extração ruim de PDF.
 */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}` +
    `${String.fromCharCode(11)}${String.fromCharCode(12)}` +
    `${String.fromCharCode(14)}-${String.fromCharCode(31)}` +
    `${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}]`,
  "g"
);

/** Remove NUL. Mínimo indispensável para o Postgres aceitar o texto. */
export function stripNullBytes(value: string): string {
  // includes() antes de split/join: o caso comum é não ter NUL nenhum, e aí não realoca nada.
  return value.includes(NUL) ? value.split(NUL).join("") : value;
}

/** Idem para campos opcionais, preservando null/undefined. */
export function stripNullBytesNullable<T extends string | null | undefined>(value: T): T {
  return typeof value === "string" ? (stripNullBytes(value) as T) : value;
}

/**
 * Limpeza para texto extraído de PDF: NUL + demais controles C0 + não-caracteres. Nesses
 * arquivos esses bytes são ruído de extração, nunca conteúdo.
 */
export function cleanExtractedText(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

/**
 * Aplica stripNullBytes recursivamente em todas as strings de um objeto/array. Rede de
 * segurança para o payload que vai ao banco: sanear campo por campo é fácil de esquecer
 * quando alguém adiciona um campo novo depois.
 */
export function deepStripNullBytes<T>(value: T): T {
  if (typeof value === "string") return stripNullBytes(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => deepStripNullBytes(item)) as unknown as T;
  if (value && typeof value === "object" && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepStripNullBytes(item);
    }
    return out as T;
  }
  return value;
}
