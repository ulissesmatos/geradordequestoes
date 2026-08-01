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

/** Palavras que não distinguem uma matéria de outra e só inflam a semelhança. */
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "a", "o", "para", "com", "nocoes"]);

function meaningfulTokens(value: string): string[] {
  return normalizeName(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Item mais parecido quando `matchByName` não achou nada — por sobreposição de palavras.
 *
 * Devolve `null` quando NENHUMA palavra significativa é compartilhada. Isso é deliberado:
 * "mais próximo" só faz sentido havendo alguma relação. Encaixar um pedido de Direito Penal
 * numa matéria sorteada corromperia o desempenho por matéria, que é justamente o dado que
 * alimenta a revisão espaçada e o card de "assuntos para reforçar".
 */
export function closestByName<T extends { name: string }>(
  items: T[],
  query: string
): { item: T; score: number } | null {
  const queryTokens = meaningfulTokens(query);
  if (queryTokens.length === 0) return null;

  const tokenized = items.map((item) => ({ item, tokens: meaningfulTokens(item.name) }));

  // Em quantas matérias cada palavra aparece. "direito" está em várias e por isso NÃO
  // distingue nada — é palavra de família, não de identidade.
  const documentFrequency = new Map<string, number>();
  for (const entry of tokenized) {
    for (const token of new Set(entry.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  let best: { item: T; score: number } | null = null;
  for (const { item, tokens } of tokenized) {
    if (tokens.length === 0) continue;

    const shared = tokens.filter((token) => queryTokens.some((other) => tokensMatch(token, other)));
    if (shared.length === 0) continue;

    /*
     * Palavra de família em comum não basta. Sem esta guarda, "Direito Penal" caía em
     * "Direito Constitucional" só por dividirem "direito" — e questões de Penal entrando
     * como Constitucional mentem no desempenho por matéria do aluno.
     *
     * Aceita quando a semelhança vem de uma palavra EXCLUSIVA daquela matéria, ou quando o
     * pedido inteiro foi coberto (aí não sobrou especialização contradita).
     */
    const hasDistinctiveToken = shared.some((token) => documentFrequency.get(token) === 1);
    const allQueryTokensMatched = queryTokens.every((token) => tokens.some((other) => tokensMatch(token, other)));
    if (!hasDistinctiveToken && !allQueryTokensMatched) continue;

    // Jaccard: penaliza tanto a matéria genérica demais quanto a específica demais.
    const score = shared.length / new Set([...queryTokens, ...tokens]).size;
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

/** Duas palavras são a mesma raiz? Cobre flexão ("lógica"/"lógico") e prefixo. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  // 5 caracteres em comum separa "logica"/"logico" de coincidências curtas como
  // "direito"/"direta", que compartilham só 4.
  return common >= 5;
}

/**
 * Guarda antes de criar um assunto a partir de rótulo da IA. Mais folgada que a de matéria:
 * assunto costuma ser descritivo mesmo ("Concordância verbal e nominal"), mas continua
 * recusando frase inteira, que poluiria o catálogo de forma difícil de desfazer.
 */
export function isPlausibleTopicName(name: string) {
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 80) return false;
  if (clean.split(/\s+/).length > 10) return false;
  if (/[.!?]$/.test(clean)) return false;
  return true;
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
