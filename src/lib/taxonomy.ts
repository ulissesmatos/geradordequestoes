/**
 * Utilitários de taxonomia (matérias/assuntos) compartilhados.
 *
 * Existiam 4+ cópias locais de `normalizeText` espalhadas (executors.ts, materials.ts,
 * study-tools.ts, generateQuestions.ts). Este módulo centraliza a normalização e o
 * casamento por nome, e resolve o rótulo de matéria que a IA da extração devolve
 * (`ReferenceQuestion.subjectHint`) para uma `Subject` real do banco.
 */

/** NFD + remove acentos + lowercase + trim. Mesma semântica das cópias que existiam antes. */
export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Casamento em duas camadas: primeiro igualdade normalizada em TODA a lista, depois
 * substring bidirecional. A ordem importa — rodar o exato primeiro garante que o hint
 * "Direito Penal" case com a matéria "Direito Penal" mesmo existindo uma matéria "Direito"
 * que também bateria por substring.
 */
export function matchByName<T extends { name: string }>(items: T[], query: string): T | null {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return null;
  return (
    items.find((item) => normalizeName(item.name) === normalizedQuery) ??
    items.find(
      (item) => normalizeName(item.name).includes(normalizedQuery) || normalizedQuery.includes(normalizeName(item.name))
    ) ??
    null
  );
}

/**
 * Variantes que a IA costuma devolver para a MESMA matéria. Sem esse passo, o auto-create
 * do backfill criaria "Português" E "Língua Portuguesa" como matérias diferentes no catálogo
 * que o aluno vê. Chave sempre normalizada (sem acento, minúscula).
 */
const SUBJECT_ALIASES: Record<string, string> = {
  "lingua portuguesa": "Português",
  "linguagem": "Português",
  "linguagens": "Português",
  "portugues instrumental": "Português",
  "gramatica": "Português",
  "interpretacao de texto": "Português",
  "compreensao e interpretacao de textos": "Português",
  "redacao oficial": "Redação Oficial",
  "raciocinio logico matematico": "Raciocínio Lógico",
  "raciocinio logico-matematico": "Raciocínio Lógico",
  "logica": "Raciocínio Lógico",
  "matematica basica": "Matemática",
  "nocoes de informatica": "Informática",
  "informatica basica": "Informática",
  "nocoes de direito constitucional": "Direito Constitucional",
  "nocoes de direito administrativo": "Direito Administrativo",
  "constitucional": "Direito Constitucional",
  "administrativo": "Direito Administrativo",
  "penal": "Direito Penal",
  "processual penal": "Direito Processual Penal",
  "atualidades e conhecimentos gerais": "Atualidades",
  "conhecimentos gerais": "Atualidades",
  "etica no servico publico": "Ética no Serviço Público",
  "legislacao especial": "Legislação Especial"
};

/** Aplica o mapa de variantes; sem match, devolve o hint com espaços normalizados. */
export function canonicalSubjectName(hint: string) {
  const trimmed = hint.replace(/\s+/g, " ").trim();
  return SUBJECT_ALIASES[normalizeName(trimmed)] ?? trimmed;
}

/**
 * Guarda de sanidade antes de aceitar um hint como nome de matéria: a IA às vezes devolve
 * uma frase inteira em vez de um rótulo curto, e criar matéria a partir disso poluiria o
 * catálogo de forma difícil de desfazer.
 */
export function isPlausibleSubjectName(name: string) {
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 60) return false;
  if (clean.split(/\s+/).length > 5) return false;
  // Frase (termina em pontuação de sentença) não é rótulo de matéria.
  if (/[.!?;:]$/.test(clean)) return false;
  return true;
}

export type SubjectLike = { id: string; name: string };

/**
 * Resolve o rótulo livre de matéria vindo da IA para uma matéria cadastrada.
 * Não cria nada — quem decide criar é o chamador (ver `resolveOrCreateSubjectId`
 * em src/app/admin/referencias/actions.ts).
 */
export function resolveSubjectFromHint<T extends SubjectLike>(input: {
  hint: string | null | undefined;
  subjects: T[];
}): { subject: T | null; canonicalName: string | null } {
  const hint = input.hint?.trim();
  if (!hint) return { subject: null, canonicalName: null };
  const canonicalName = canonicalSubjectName(hint);
  return { subject: matchByName(input.subjects, canonicalName), canonicalName };
}
