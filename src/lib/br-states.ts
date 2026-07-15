/** Estados brasileiros (UFs) e contexto regional para a IA. */

export const BR_STATES: { uf: string; name: string }[] = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" }
];

export const BR_UF_SET = new Set(BR_STATES.map((state) => state.uf));

const NAME_BY_UF = new Map(BR_STATES.map((state) => [state.uf, state.name]));

export function formatStatesForPrompt(ufs: string[]): string {
  return ufs
    .filter((uf) => NAME_BY_UF.has(uf))
    .map((uf) => `${NAME_BY_UF.get(uf)} (${uf})`)
    .join(", ");
}

/**
 * Bloco de contexto regional injetado no system prompt do chat e na geração
 * de questões/materiais. Centralizado aqui para chat e executors não divergirem.
 */
export function buildRegionalContext(ufs: string[]): string {
  const formatted = formatStatesForPrompt(ufs);
  if (!formatted) return "";
  return [
    `Estados de interesse do usuário para concursos: ${formatted}.`,
    "Quando relevante, alinhe exemplos, legislação estadual, órgãos públicos, jurisprudência local e editais a esses estados.",
    "Em temas de alcance nacional (Constituição, leis federais, matérias gerais), não force regionalização desnecessária."
  ].join("\n");
}
