import { AiProvider, type Difficulty, type QuestionAnswer, type QuestionFormat, type QuestionSetMode } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getAiSettings, providerLabel } from "@/lib/ai/settings";
import { splitIntoBatches } from "@/lib/question-limits";
import { normalizeDisplayText } from "@/lib/sanitize";

/** Questão real usada como base 1:1 no modo "variação fiel" (perto do enunciado original). */
export type ReferenceVariantSource = {
  id: string;
  statement: string;
  /** Texto de apoio compartilhado do qual a questão original dependia, se houver. */
  supportText: string | null;
  answer: QuestionAnswer | null;
  answerText: string | null;
  explanation: string | null;
  trickNote: string | null;
};

/**
 * Piso de tamanho do texto de apoio. Baixo de propósito: em Português um item costuma
 * julgar UM período curto — "Houve atrasos, logo não será possível cumprir o cronograma"
 * tem 57 caracteres. Com um piso alto (era 80), o modelo NÃO TINHA como devolver esse
 * período no supportText, então encavalava o material dentro do próprio enunciado; e
 * quando tentava, normalizeGenerated descartava o texto curto e sobrava um item citando
 * um texto inexistente. Serve apenas para barrar placeholder inútil ("texto", "N/A").
 */
const MIN_SUPPORT_TEXT_LENGTH = 25;

/**
 * ORDEM DOS CAMPOS IMPORTA: geração estruturada preenche na ordem declarada, sem voltar
 * atrás. "explanation" vem ANTES de "answer" e de "options" de propósito — a IA precisa
 * "mostrar o trabalho" (resolver a conta/lógica na justificativa) antes de se comprometer
 * com o gabarito, não depois. Com answer/isCorrect vindo primeiro, já vimos em produção a IA
 * se corrigir só na explicação (ex.: concluir CERTO no texto) sem conseguir voltar e ajustar
 * o campo já emitido — o aluno recebia um gabarito que contradizia a própria justificativa.
 */
const generatedItemSchema = z.object({
  statement: z.string().min(20),
  format: z.enum(["CERTO_ERRADO", "MULTIPLA_ESCOLHA"]),
  explanation: z.string().min(10),
  answer: z.enum(["CERTO", "ERRADO"]).nullable().optional(),
  difficulty: z.enum(["FACIL", "MEDIO", "DIFICIL"]),
  /**
   * Classificação explícita: a questão só se resolve com o texto-base do grupo?
   * Obriga o modelo a decidir de forma consciente (em vez de deixar implícito) e nos dá
   * um sinal verificável em código — ver enforceSelfContainment.
   */
  dependsOnSupportText: z.boolean(),
  // Só preenchido no modo "variação fiel": índice (1-based) da questão de referência usada como base.
  sourceIndex: z.number().int().min(1).optional(),
  options: z.array(
    z.object({
      label: z.string().min(1).max(24),
      text: z.string().min(1),
      isCorrect: z.boolean()
    })
  )
});

/**
 * Estrutura em grupos: a maioria dos grupos tem 1 questão independente (supportText null),
 * mas — sobretudo em nível difícil — um grupo pode reunir várias questões que julgam o MESMO
 * texto de apoio (situação hipotética, trecho de lei, texto informativo), no estilo real do
 * Cebraspe. Achatado em questões individuais logo depois de receber a resposta da IA (ver
 * normalizeGenerated); o resto do app sempre trabalha com a lista achatada.
 */
const generatedQuestionSchema = z.object({
  groups: z.array(
    z.object({
      supportText: z
        .string()
        .min(MIN_SUPPORT_TEXT_LENGTH)
        .nullable()
        .optional()
        .describe("Texto de apoio compartilhado pelas questões deste grupo; null quando as questões forem independentes."),
      questions: z.array(generatedItemSchema).min(1)
    })
  )
});

export type GeneratedQuestion = z.infer<typeof generatedItemSchema> & { supportText: string | null };

/**
 * O front-end renderiza fórmulas com KaTeX a partir destes delimitadores (ver src/components/math-text.tsx).
 * Usa \( \) / \[ \] em vez de $ $ / $$ $$ porque textos de concurso citam valores em reais (ex.: "R$ 1.000,00"),
 * e um "$" solto quebraria o parser de fórmulas.
 */
const MATH_FORMATTING_INSTRUCTION = [
  "Notação matemática: sempre que o enunciado, o texto de apoio, as alternativas ou a justificativa envolverem fórmulas, expressões, equações ou símbolos matemáticos (potências, frações, raízes, integrais, somatórios, matrizes, letras gregas etc.), escreva-os em LaTeX delimitado por \\( ... \\) dentro do texto, ou \\[ ... \\] em bloco.",
  "PROIBIDO deixar comando LaTeX solto fora dos delimitadores. ERRADO: 'vale t^{\\alpha-1} para x>0'. CERTO: 'vale \\(t^{\\alpha-1}\\) para \\(x>0\\)'. Comando cru como \\int, \\frac, \\alpha, \\Gamma ou expoente ^{...} fora de \\( \\) aparece como código na tela do aluno, sem virar fórmula.",
  "Uma mesma frase NÃO pode ter parte delimitada e parte solta — ou tudo que é fórmula está dentro de \\( \\), ou a questão sai quebrada. Na dúvida, delimite.",
  "Nunca use $ ou $$ como delimitador (confunde com valores em reais, ex. 'R$ 10,00'), e nunca use caracteres matemáticos Unicode como 𝐹 ou 𝑥 — escreva \\(F\\) e \\(x\\). Fora das fórmulas, mantenha texto normal em português."
].join("\n");

/**
 * Recebe a quantidade para repetir o número LITERAL. A versão anterior dizia só "exatamente a
 * quantidade pedida", e com vários grupos o modelo perdia a conta e estourava (pedido de 5
 * virando 20 na prática). O número explícito ajuda, mas quem garante é enforceQuantity.
 */
function buildGroupStructureInstruction(quantity: number) {
  return [
    'Estrutura da resposta: agrupe as questões em "groups". Cada group tem um "supportText" (texto de apoio compartilhado) e uma lista "questions". Use supportText null nos grupos cujas questões forem puramente conceituais/teóricas e se resolvam sem nenhum texto-base.',
    `CONTAGEM OBRIGATÓRIA: somando as questões de TODOS os groups, o total tem de ser exatamente ${quantity}. Não é "pelo menos ${quantity}" nem "aproximadamente" — é ${quantity}. Antes de responder, conte os itens de todos os groups e confirme que a soma dá ${quantity}. Devolver mais que isso é erro.`
  ].join("\n");
}

/**
 * Regra sempre presente no prompt. É a camada de PREVENÇÃO do contrato de
 * autossuficiência; a de VERIFICAÇÃO é determinística, em código (enforceSelfContainment) —
 * pedir "não alucine" não basta, então validamos e mandamos refazer quando quebra.
 */
const SELF_CONTAINMENT_INSTRUCTION = [
  "REGRA OBRIGATÓRIA — autossuficiência de cada questão:",
  'Toda questão precisa ser respondível apenas com o que o aluno vê na tela: o texto de apoio do grupo (supportText) + o enunciado. Se o enunciado mencionar "o texto", "o trecho", "a passagem", "o fragmento", "o autor", "acima", ou números de linha, então o grupo dessa questão OBRIGATORIAMENTE precisa ter o supportText correspondente preenchido. É proibido citar material que não esteja no supportText do próprio grupo.',
  'Preencha "dependsOnSupportText": true quando a questão só se resolve com o texto-base do grupo, e false quando ela for autossuficiente sozinha. Se marcar true, o grupo TEM de ter supportText — nunca true com supportText null.',
  `O supportText pode ser curto: um único período de ${MIN_SUPPORT_TEXT_LENGTH}+ caracteres já é válido quando o item analisa apenas uma frase. Não é preciso inventar texto longo para cumprir a regra.`
].join("\n");

/**
 * Português e afins: o material analisado vai para o texto de apoio, não solto no enunciado.
 * Aplicado em QUALQUER dificuldade (diferente de SUPPORT_TEXT_INSTRUCTION, que é só do nível
 * difícil), porque um item de crase/conjunção/pontuação depende de um período-base mesmo no fácil.
 */
const PORTUGUESE_SUPPORT_TEXT_INSTRUCTION = [
  "Matéria de língua/texto (Português, Redação Oficial, Interpretação de Texto, Gramática):",
  "Quando o item analisar um período, frase, trecho ou texto específico — interpretação, coesão, coerência, pontuação, crase, regência, concordância, sentido/classificação de conjunções, reescrita, figuras de linguagem, ortografia em contexto etc. —, o material analisado NÃO pode ficar solto dentro do enunciado entre aspas: coloque-o no supportText do grupo e escreva o enunciado referindo-se a ele (ex.: supportText = 'Houve atrasos, logo não será possível cumprir o cronograma.' e enunciado = 'No período apresentado, a conjunção \"logo\" estabelece relação de conclusão.'). Marque dependsOnSupportText: true nesses itens.",
  "Vários itens podem julgar o MESMO supportText sob ângulos diferentes — é assim que a banca monta as provas de Português, e é o formato preferido.",
  "Só use supportText null (e dependsOnSupportText: false) quando a questão for puramente teórica e não exigir nenhum texto-base — ex.: 'A crase é a fusão da preposição \"a\" com o artigo \"a\".'"
].join("\n");

/** Detecção determinística de matéria/assunto que exige texto de apoio para itens de análise. */
function isLanguageSubject(subject: string, topic: string): boolean {
  const haystack = `${subject} ${topic}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return /portugu|reda[cç]|interpretac|gramat|linguistic|lingua |texto|literatura/.test(haystack);
}

/**
 * Só entra no prompt quando difficulty === "DIFICIL" — replica o padrão real do Cebraspe de
 * blocos "texto de apoio + vários itens Certo/Errado que o julgam", em vez de questões sempre
 * independentes.
 *
 * Depende da quantidade porque a versão fixa ("um ou mais grupos, cada um com 3 a 6 questões")
 * era lida como licença para multiplicar: um pedido de 5 itens no nível difícil voltava com 20,
 * quatro grupos de cinco. Agora o teto por grupo nunca passa do total pedido, e abaixo de 3
 * itens a instrução nem entra — não cabe bloco de prova em 1 ou 2 questões.
 */
function buildSupportTextInstruction(quantity: number) {
  const maxPerGroup = Math.min(6, quantity);
  return `Nível DIFÍCIL — texto de apoio: quando o assunto se prestar a isso (interpretação de texto, direito, legislação, história, temas com uma situação hipotética ou trecho normativo plausível — NÃO force em assuntos que não combinam, como pura gramática/ortografia/informática básica), você pode montar um bloco no estilo real de prova: um supportText de 2 a 4 parágrafos (uma situação hipotética, um texto informativo ou um trecho de lei/norma) seguido de 3 a ${maxPerGroup} questões — no formato já definido acima — que o julgam sob ângulos diferentes. ATENÇÃO: isso NÃO aumenta o total. O bloco consome parte das ${quantity} questões pedidas, nunca soma por cima delas; se um bloco já usar as ${quantity}, não crie outro grupo. Nem toda questão difícil precisa disso: se o tema não render um texto de apoio natural, gere itens independentes normalmente (supportText null).`;
};

// Ordem dos campos abaixo (required + properties) espelha de propósito a de generatedItemSchema —
// mesmo motivo: "explanation" antes de "answer"/"options" para a IA raciocinar antes de responder.
const generatedItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "format", "explanation", "answer", "difficulty", "dependsOnSupportText", "options"],
  properties: {
    statement: { type: "string", minLength: 20 },
    format: { type: "string", enum: ["CERTO_ERRADO", "MULTIPLA_ESCOLHA"] },
    explanation: { type: "string", minLength: 10 },
    answer: { type: ["string", "null"], enum: ["CERTO", "ERRADO", null] },
    difficulty: { type: "string", enum: ["FACIL", "MEDIO", "DIFICIL"] },
    dependsOnSupportText: { type: "boolean" },
    sourceIndex: { type: "integer", minimum: 1 },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text", "isCorrect"],
        properties: {
          label: { type: "string", maxLength: 24 },
          text: { type: "string" },
          isCorrect: { type: "boolean" }
        }
      }
    }
  }
} as const;

const questionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supportText", "questions"],
        properties: {
          supportText: { type: ["string", "null"], minLength: MIN_SUPPORT_TEXT_LENGTH },
          questions: { type: "array", minItems: 1, items: generatedItemJsonSchema }
        }
      }
    }
  }
} as const;

type RawGroup = { supportText?: string | null; questions: z.infer<typeof generatedItemSchema>[] };

/**
 * Marcas textuais de dependência de um texto-base. Verificação determinística e de custo
 * zero (sem IA): se o enunciado fala de "o texto"/"o trecho"/"linha 3" e o grupo não trouxe
 * supportText, a questão é literalmente impossível de responder e não pode ir para o aluno.
 */
const EXTERNAL_TEXT_REFERENCE_PATTERNS: RegExp[] = [
  /\b(?:o|no|do|ao|nesse|neste|desse|deste|esse|este|referido)\s+texto\b/i,
  /\btexto\s+(?:acima|apresentado|anterior|lido|base|a\s+seguir|transcrito)\b/i,
  /\b(?:o|no|do|nesse|neste)\s+trecho\b/i,
  /\btrecho\s+(?:acima|apresentado|anterior|a\s+seguir|em\s+destaque|transcrito)\b/i,
  /\b(?:o|no|do)\s+fragmento\b/i,
  /\b(?:a|na|da)\s+passagem\s+(?:acima|apresentada|anterior|destacada)\b/i,
  /\b(?:o|no|do)\s+excerto\b/i,
  /\bo\s+autor\s+(?:do|desse|deste|no)\s+texto\b/i,
  /\blinhas?\s+\d+/i,
  /\b(?:ℓ|l)\.\s*\d+/i,
  /\b(?:primeiro|segundo|terceiro|quarto|último|ultimo)\s+par[áa]grafo\b/i,
  /\bpar[áa]grafo\s+(?:acima|anterior|citado|apresentado)\b/i,
  /\b(?:per[íi]odo|frase|ora[cç][ãa]o|senten[cç]a)\s+(?:acima|apresentad[oa]|anterior|em\s+destaque|transcrit[oa])\b/i,
  /\bde\s+acordo\s+com\s+o\s+texto\b/i,
  /\bsegundo\s+o\s+texto\b/i,
  /\bcom\s+base\s+n[oa]\s+(?:texto|trecho|fragmento|passagem|per[íi]odo)\b/i,
  /\b(?:quadro|figura|tabela|gr[áa]fico|imagem|charge)\s+acima\b/i,
  /\bacima\s+(?:apresentad|transcrit|reproduzid|exposto)/i
];

/**
 * Trecho analisado encavalado dentro do enunciado, entre aspas. É o caso reportado na prática:
 * "Em “Houve atrasos, logo não será possível cumprir o cronograma”, a conjunção “logo”...".
 * Em Português o material analisado tem de ir para o supportText, então tratamos isso como
 * violação também — em vez de confiar que o modelo vai seguir a instrução do prompt.
 * Piso de 30 caracteres para não confundir com a citação da palavra/expressão julgada ("logo").
 */
const INLINE_QUOTED_FRAGMENT_PATTERN = /[“"«‘']([^”"»’']{30,})[”"»’']/;

/**
 * Corta o excedente para a quantidade pedida. É a trava REAL do número de questões: `quantity`
 * sempre foi só uma linha de prompt, e o banco gravava o que viesse — pedido de 5 no nível
 * difícil chegava a virar 20 questões (grupos de bloco multiplicando o total). Pedir "conte
 * antes de responder" ajuda, mas não garante; isto garante.
 *
 * Corta do fim, preservando a ordem. Truncar no meio de um bloco é seguro porque o supportText
 * viaja em CADA questão depois do achatamento (ver normalizeGenerated) — nenhuma questão fica
 * órfã do texto que ela julga.
 *
 * Não completa quando vem MENOS que o pedido: forçar uma segunda chamada por 1 item faltando
 * custaria mais do que vale, e o set é salvo com a contagem real, então o app não mente.
 */
function enforceQuantity(groups: RawGroup[], expected: number): RawGroup[] {
  const total = groups.reduce((sum, group) => sum + group.questions.length, 0);
  if (total <= expected) return groups;

  const trimmed: RawGroup[] = [];
  let remaining = expected;
  for (const group of groups) {
    if (remaining <= 0) break;
    const questions = group.questions.slice(0, remaining);
    remaining -= questions.length;
    trimmed.push({ ...group, questions });
  }
  return trimmed;
}

/**
 * Delimitadores que o front-end reconhece (ver src/components/math-text.tsx). Precisa casar
 * exatamente com MATH_PATTERN de lá: o que estiver fora disso NÃO vira fórmula na tela.
 */
const MATH_DELIMITED = /\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g;

/** Marcas de LaTeX: comando (\int, \frac, \alpha) ou expoente/índice com chaves (^{...}, _{...}). */
const LATEX_MARKER = /\\[a-zA-Z]{2,}|[\^_]\{/;

/**
 * Texto com LaTeX FORA de delimitador — o aluno vê "\int_0^\infty" cru na tela em vez da
 * fórmula. Aconteceu em produção com a mesma frase saindo metade delimitada, metade crua.
 */
function hasBareLatex(value: string | null | undefined): boolean {
  if (!value) return false;
  // Remove o que já está delimitado e procura marca de LaTeX no que sobrou.
  return LATEX_MARKER.test(value.replace(MATH_DELIMITED, " "));
}

/** Campos de uma questão que o aluno lê e que podem conter fórmula. */
function questionTexts(question: z.infer<typeof generatedItemSchema>, supportText?: string | null) {
  return [supportText, question.statement, question.explanation, ...question.options.map((o) => o.text)];
}

type MathViolation = { statement: string; sample: string };

/** Questões com fórmula crua, para o reparo apontar exatamente o problema. */
function findMathViolations(groups: RawGroup[]): MathViolation[] {
  const violations: MathViolation[] = [];
  for (const group of groups) {
    for (const question of group.questions) {
      const offender = questionTexts(question, group.supportText).find((text) => hasBareLatex(text));
      if (offender) {
        const bare = offender.replace(MATH_DELIMITED, " ").match(LATEX_MARKER)?.[0] ?? "";
        violations.push({ statement: question.statement, sample: bare });
      }
    }
  }
  return violations;
}

function buildMathRepairInstruction(violations: MathViolation[]): string {
  const list = violations
    .map((v, i) => `${i + 1}. "${v.statement.slice(0, 160)}" — contém "${v.sample}" fora de \( \).`)
    .join("\n");
  return [
    "CORREÇÃO OBRIGATÓRIA — fórmulas fora dos delimitadores.",
    "Nestas questões há LaTeX solto, que aparece como código na tela do aluno em vez de virar fórmula:",
    list,
    "Gere o lote NOVAMENTE do zero, com a mesma quantidade, formato e dificuldade, garantindo que TODA expressão matemática (em enunciado, texto de apoio, alternativas e justificativa) esteja dentro de \( ... \) ou \[ ... \]. Não deixe nenhum comando LaTeX nem expoente com chaves fora dos delimitadores, e não misture parte delimitada com parte solta na mesma frase."
  ].join("\n");
}

function hasUsableSupportText(group: RawGroup): boolean {
  return Boolean(group.supportText && group.supportText.trim().length >= MIN_SUPPORT_TEXT_LENGTH);
}

function referencesExternalText(statement: string): boolean {
  return EXTERNAL_TEXT_REFERENCE_PATTERNS.some((pattern) => pattern.test(statement));
}

type OrphanQuestion = { statement: string; reason: string };

/** Questões que dependem de um texto-base que o grupo não forneceu (ou o embutiu no enunciado). */
function findOrphanQuestions(groups: RawGroup[], options: { languageSubject: boolean }): OrphanQuestion[] {
  const orphans: OrphanQuestion[] = [];
  for (const group of groups) {
    if (hasUsableSupportText(group)) continue;
    for (const question of group.questions) {
      if (question.dependsOnSupportText) {
        orphans.push({
          statement: question.statement,
          reason: "marcada com dependsOnSupportText: true, mas o grupo veio com supportText null"
        });
      } else if (referencesExternalText(question.statement)) {
        orphans.push({
          statement: question.statement,
          reason: "cita um texto/trecho/período/linha que não foi fornecido em nenhum supportText"
        });
      } else if (options.languageSubject && INLINE_QUOTED_FRAGMENT_PATTERN.test(question.statement)) {
        orphans.push({
          statement: question.statement,
          reason:
            "analisa um período citado dentro do próprio enunciado; em matéria de língua esse material deve ficar no supportText do grupo, com o enunciado apenas se referindo a ele"
        });
      }
    }
  }
  return orphans;
}

function buildSelfContainmentRepairInstruction(orphans: OrphanQuestion[]): string {
  const list = orphans
    .map((orphan, index) => `${index + 1}. "${orphan.statement.slice(0, 220)}" — ${orphan.reason}.`)
    .join("\n");
  return [
    "CORREÇÃO OBRIGATÓRIA — sua resposta anterior foi REJEITADA pela validação automática.",
    "Estas questões dependem de um texto-base que você não forneceu, então são impossíveis de responder:",
    list,
    "Gere o lote NOVAMENTE do zero, com a mesma quantidade, formato e dificuldade, corrigindo cada caso de UMA destas duas formas:",
    "(a) PREFERIDO — coloque o período/trecho analisado no supportText do grupo daquela questão (pode ser um único período curto) e mantenha o enunciado referindo-se a ele, com dependsOnSupportText: true; ou",
    '(b) reescreva o enunciado para ser totalmente autossuficiente, sem mencionar "o texto", "o trecho", "a passagem", "o autor", "acima" nem números de linha, com dependsOnSupportText: false.',
    "Não devolva NENHUMA questão que cite material ausente do supportText do próprio grupo."
  ].join("\n");
}

/**
 * Fail-safe da última camada: se nem o reparo resolveu, descarta as questões quebradas em vez
 * de entregar ao aluno um item que cita um texto inexistente. Só falha de vez se sobrar nada.
 */
function dropOrphanQuestions(groups: RawGroup[], options: { languageSubject: boolean }): RawGroup[] {
  const cleaned = groups
    .map((group) => {
      if (hasUsableSupportText(group)) return group;
      return {
        ...group,
        questions: group.questions.filter(
          (question) =>
            !question.dependsOnSupportText &&
            !referencesExternalText(question.statement) &&
            !(options.languageSubject && INLINE_QUOTED_FRAGMENT_PATTERN.test(question.statement))
        )
      };
    })
    .filter((group) => group.questions.length > 0);

  if (cleaned.length === 0) {
    throw new Error(
      "A IA insistiu em gerar questões que citam um texto de apoio inexistente. Tente novamente ou use um modelo mais forte no painel admin."
    );
  }
  return cleaned;
}

/**
 * Marcas de raciocínio interno vazando pro texto que o aluno lê — a IA "comentando sobre a
 * própria geração" em vez de só explicar o conteúdo. Visto em produção: justificativa que
 * concluía CERTO no meio do texto e terminava com "(Como a ferramenta exige gabarito,
 * ajuste: a afirmação é CERTO.)" — o campo answer já tinha sido emitido ANTES da explicação
 * (ver comentário em generatedItemSchema) e ficou ERRADO, contradizendo a própria
 * justificativa. Reordenar o schema ataca a causa; isto aqui é a rede de segurança para o
 * que passar mesmo assim.
 *
 * De propósito, NÃO pega contraste pedagógico legítimo ("à primeira vista pareceria X, mas
 * na verdade Y é o correto") — só menções diretas à ferramenta/sistema/schema, que uma
 * explicação de conteúdo de concurso nunca teria motivo genuíno para fazer.
 */
const LEAKED_REASONING_PATTERNS: RegExp[] = [
  /\ba\s+ferramenta\b/i,
  /\bo\s+sistema\s+exig/i,
  /\bajuste:\s*a\s+afirma[çc][ãa]o\b/i,
  /\bo\s+campo\s+(?:answer|gabarito)\b/i,
  /\b(?:answer|gabarito)\s+(?:obrigat[óo]rio|exigido)\b/i
];

type LeakedReasoningIssue = { statement: string };

/** Questões cuja justificativa vazou raciocínio/comentário sobre a própria ferramenta. */
function findLeakedReasoningQuestions(groups: RawGroup[]): LeakedReasoningIssue[] {
  const issues: LeakedReasoningIssue[] = [];
  for (const group of groups) {
    for (const question of group.questions) {
      if (LEAKED_REASONING_PATTERNS.some((pattern) => pattern.test(question.explanation))) {
        issues.push({ statement: question.statement });
      }
    }
  }
  return issues;
}

function buildLeakedReasoningRepairInstruction(issues: LeakedReasoningIssue[]): string {
  const list = issues.map((issue, index) => `${index + 1}. "${issue.statement.slice(0, 160)}"`).join("\n");
  return [
    "CORREÇÃO OBRIGATÓRIA — a justificativa destas questões vazou raciocínio interno da geração (ex.: menciona a ferramenta/sistema, ou narra um ajuste de resposta dentro do próprio texto) em vez de só explicar o conteúdo para o aluno:",
    list,
    "Gere o lote NOVAMENTE do zero, com a mesma quantidade, formato e dificuldade. Resolva o raciocínio/conta ANTES de decidir a resposta final: escreva a justificativa já com a conclusão definitiva e certifique-se de que answer (ou isCorrect nas alternativas) reflete EXATAMENTE essa conclusão. A justificativa deve conter só a explicação do conteúdo — nunca mencione a ferramenta, o sistema, JSON, schema, nem narre estar 'ajustando' ou 'corrigindo' a resposta."
  ].join("\n");
}

/**
 * Fail-safe: se nem o reparo tirou o vazamento, descarta a questão — sinal forte de que o
 * gabarito também pode estar errado (não é só estética, como o LaTeX cru), então servir a
 * questão pro aluno é pior que servir menos questões.
 */
function dropLeakedReasoningQuestions(groups: RawGroup[]): RawGroup[] {
  const cleaned = groups
    .map((group) => ({
      ...group,
      questions: group.questions.filter((question) => !LEAKED_REASONING_PATTERNS.some((pattern) => pattern.test(question.explanation)))
    }))
    .filter((group) => group.questions.length > 0);

  if (cleaned.length === 0) {
    throw new Error(
      "A IA insistiu em vazar raciocínio interno na justificativa das questões. Tente novamente ou use um modelo mais forte no painel admin."
    );
  }
  return cleaned;
}

export async function generateQuestions(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  quantity: number;
  format?: QuestionFormat;
  alternativesCount?: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  /** Questões reais de prova para servir de âncora de estilo — bloco proeminente separado do contexto do aluno. */
  referenceContext?: string;
  /**
   * Modo "variação fiel": uma questão real por item, nesta ordem — a IA reaproveita boa parte do
   * enunciado original ajustando detalhes, em vez de só se inspirar no estilo. Quando presente,
   * substitui `quantity`/`referenceContext`: gera exatamente uma variação por item da lista.
   */
  referenceQuestions?: ReferenceVariantSource[];
  /** Modelo alternativo (mesma API key do provedor configurado). Vazio = modelo padrão. */
  modelOverride?: string;
  /**
   * Emissor de progresso para a tela. Existe porque o loop de reparo faz uma SEGUNDA geração
   * completa: sem avisar, a espera dobra e parece que a tela travou.
   */
  onProgress?: (label: string) => void;
}) {
  const baseSettings = await getAiSettings();
  if (!baseSettings.apiKey) {
    throw new Error(`Configure a chave da ${providerLabel(baseSettings.provider)} no painel admin.`);
  }
  const settings = input.modelOverride?.trim()
    ? { ...baseSettings, model: input.modelOverride.trim() }
    : baseSettings;

  const format = input.format ?? "CERTO_ERRADO";
  const alternativesCount = clampAlternatives(input.alternativesCount ?? 4);
  const prompt =
    input.referenceQuestions && input.referenceQuestions.length > 0
      ? buildVariantPrompt({ ...input, format, alternativesCount, referenceQuestions: input.referenceQuestions })
      : buildPrompt({ ...input, format, alternativesCount, referenceContext: input.referenceContext });

  const runProvider = (fullPrompt: string): Promise<RawGroup[]> => {
    if (settings.provider === AiProvider.CLAUDE) return generateWithClaude(settings, fullPrompt);
    if (settings.provider === AiProvider.OPENROUTER) return generateWithOpenRouter(settings, fullPrompt);
    return generateWithOpenAI(settings, fullPrompt);
  };
  const checkOptions = { languageSubject: isLanguageSubject(input.subject, input.topic) };

  /** Uma chamada + o loop de reparo dela. Reparo é por LOTE, então custa um lote, não o bloco. */
  const runBatch = async (batchPrompt: string, expected: number): Promise<RawGroup[]> => {
    let groups = await runProvider(batchPrompt);

    // Contratos verificados em código (custo zero: regex sobre o que já veio). Quando algum
    // quebra, manda refazer UMA vez apontando exatamente o que deu errado — os três contratos
    // compartilham a MESMA rodada de reparo, então o custo extra é de no máximo uma chamada a
    // mais, mesmo quando mais de um falha junto.
    const orphans = findOrphanQuestions(groups, checkOptions);
    const mathViolations = findMathViolations(groups);
    const leakedReasoning = findLeakedReasoningQuestions(groups);
    if (orphans.length > 0 || mathViolations.length > 0 || leakedReasoning.length > 0) {
      input.onProgress?.("Revisando as questões geradas…");
      const fixes = [
        orphans.length > 0 ? buildSelfContainmentRepairInstruction(orphans) : "",
        mathViolations.length > 0 ? buildMathRepairInstruction(mathViolations) : "",
        leakedReasoning.length > 0 ? buildLeakedReasoningRepairInstruction(leakedReasoning) : ""
      ]
        .filter(Boolean)
        .join("\n\n");
      const repaired = await runProvider(`${batchPrompt}\n\n${fixes}`);
      // Questão órfã ou com raciocínio vazado é descartada (item impossível de responder, ou
      // com gabarito possivelmente errado, é pior que entregar menos). Fórmula crua NÃO
      // derruba a questão: fica feia, mas continua respondível.
      groups = repaired;
      if (findOrphanQuestions(groups, checkOptions).length > 0) groups = dropOrphanQuestions(groups, checkOptions);
      if (findLeakedReasoningQuestions(groups).length > 0) groups = dropLeakedReasoningQuestions(groups);
    }

    // Por último, depois do descarte de questões quebradas: cortar antes faria o descarte
    // devolver menos do que o pedido mesmo havendo item bom sobrando no excedente.
    return enforceQuantity(groups, expected);
  };

  // No modo variação fiel o esperado é uma variação por questão de referência.
  const totalWanted = input.referenceQuestions?.length ?? input.quantity;
  const batchSizes = splitIntoBatches(totalWanted);

  /*
   * Lote único: caminho de sempre, sem custo nem texto extra no prompt.
   *
   * O corte em lotes existe porque 4.096 tokens de saída não comportam um bloco grande — 50
   * questões numa chamada só não sairiam piores, sairiam com o JSON truncado. Mas cada lote
   * a mais é uma chamada a mais, então o caminho comum (bloco pequeno) não paga por isso.
   */
  if (batchSizes.length === 1) {
    const groups = await runBatch(prompt, totalWanted);
    return normalizeGenerated({ provider: settings.provider, model: settings.model, prompt, groups });
  }

  const allGroups: RawGroup[] = [];
  // Enunciados já gerados, repassados ao próximo lote. Sem isso, quatro lotes sobre "Crase"
  // saem quase iguais entre si: cada chamada é cega às outras e o modelo volta para os
  // mesmos exemplos canônicos do assunto.
  const generatedStatements: string[] = [];
  let generatedCount = 0;

  for (const [index, batchSize] of batchSizes.entries()) {
    const from = generatedCount + 1;
    const to = generatedCount + batchSize;
    input.onProgress?.(`Gerando questões ${from} a ${to} de ${totalWanted}…`);

    const batchPrompt =
      input.referenceQuestions && input.referenceQuestions.length > 0
        ? buildVariantPrompt({
            ...input,
            format,
            alternativesCount,
            // Fatia as fontes: cada lote gera a variação das SUAS questões de referência.
            referenceQuestions: input.referenceQuestions.slice(generatedCount, generatedCount + batchSize)
          })
        : buildPrompt({
            ...input,
            format,
            alternativesCount,
            quantity: batchSize,
            referenceContext: input.referenceContext,
            avoidStatements: generatedStatements
          });

    const groups = await runBatch(batchPrompt, batchSize);
    allGroups.push(...groups);

    generatedCount += groups.reduce((sum, group) => sum + group.questions.length, 0);
    // Só o começo do enunciado: o suficiente para o modelo reconhecer o tema já coberto, sem
    // inflar o prompt do último lote.
    if (index < batchSizes.length - 1) {
      for (const group of groups) {
        for (const question of group.questions) generatedStatements.push(question.statement.slice(0, 160));
      }
    }
  }

  return normalizeGenerated({ provider: settings.provider, model: settings.model, prompt, groups: allGroups });
}

/**
 * Lista o que já saiu nos lotes anteriores do MESMO bloco, para o lote atual não repetir.
 *
 * Sem isto, quatro lotes de 10 sobre "Crase" saem quase iguais: cada chamada é cega às
 * outras e o modelo volta sempre para os mesmos exemplos canônicos do assunto.
 */
function buildAvoidRepetitionInstruction(statements: string[] | undefined) {
  if (!statements || statements.length === 0) return "";
  return [
    "QUESTÕES JÁ GERADAS NESTE MESMO BLOCO — não repita nenhuma delas, nem versão levemente reescrita:",
    ...statements.map((statement, index) => `${index + 1}. ${statement}`),
    "Aborde ÂNGULOS DIFERENTES do assunto: outros dispositivos, outras exceções, outras pegadinhas, outros cenários. Se o assunto for estreito, varie a situação hipotética e o recorte em vez de reformular o mesmo item."
  ].join("\n");
}

function buildPrompt(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  quantity: number;
  format: QuestionFormat;
  alternativesCount: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  referenceContext?: string;
  /** Enunciados já gerados nos lotes anteriores deste mesmo bloco. */
  avoidStatements?: string[];
}) {
  const formatInstruction =
    input.format === "CERTO_ERRADO"
      ? "Formato: Certo/Errado. Cada questão deve ter exatamente duas opções: C) Certo e E) Errado. Use answer como CERTO ou ERRADO."
      : `Formato: múltipla escolha. Cada questão deve ter exatamente ${input.alternativesCount} alternativas, labels sequenciais começando em A, e apenas uma alternativa correta. Use answer como null.`;

  return [
    `Matéria: ${input.subject}`,
    `Assunto: ${input.topic}`,
    `Dificuldade: ${input.difficulty}`,
    `Quantidade: ${input.quantity}`,
    `Modo: ${input.mode ?? "ESTUDO"}`,
    formatInstruction,
    input.referenceContext
      ? `QUESTÕES REAIS DE PROVA (use como âncora de estilo, dificuldade, fraseado e pegadinhas):\n${input.referenceContext}\n\nProduza questões NOVAS e originais nesse mesmo estilo da banca (Cebraspe); espelhe as pegadinhas e a estrutura; NÃO copie verbatim.`
      : "",
    input.prompt ? `Pedido do usuário: ${input.prompt}` : "",
    input.extraInstructions ? `Instruções adicionais: ${input.extraInstructions}` : "",
    input.context ? `Contexto do aluno (histórico/desempenho): ${input.context}` : "",
    buildAvoidRepetitionInstruction(input.avoidStatements),
    "Gere questões originais de concurso público.",
    "Não copie verbatim; inspire-se no estilo e nas pegadinhas das provas reais para criar itens inéditos.",
    "Use linguagem clara, objetiva e adequada a concurso.",
    "A justificativa deve explicar de forma didática por que a resposta correta está correta.",
    "Evite temas polêmicos ou desatualizados sem contexto.",
    buildGroupStructureInstruction(input.quantity),
    SELF_CONTAINMENT_INSTRUCTION,
    isLanguageSubject(input.subject, input.topic) ? PORTUGUESE_SUPPORT_TEXT_INSTRUCTION : "",
    // Abaixo de 3 itens não cabe bloco "texto + vários itens", e a instrução só serviria de
    // convite para o modelo estourar a contagem.
    input.difficulty === "DIFICIL" && input.quantity >= 3 ? buildSupportTextInstruction(input.quantity) : "",
    MATH_FORMATTING_INSTRUCTION
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Prompt do modo "variação fiel": uma variação bem próxima por questão real, na ordem dada.
 * Diferente de buildPrompt (que só usa a referência como âncora de estilo), aqui a IA pode
 * reaproveitar boa parte do enunciado original — mas precisa reconferir o gabarito do zero,
 * porque pequenos ajustes de texto podem inverter a resposta correta.
 */
function buildVariantPrompt(input: {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  format: QuestionFormat;
  alternativesCount: number;
  mode?: QuestionSetMode;
  prompt?: string;
  extraInstructions?: string;
  context?: string;
  referenceQuestions: ReferenceVariantSource[];
}) {
  const formatInstruction =
    input.format === "CERTO_ERRADO"
      ? "Formato: Certo/Errado. Cada questão deve ter exatamente duas opções: C) Certo e E) Errado. Use answer como CERTO ou ERRADO."
      : `Formato: múltipla escolha. Cada questão deve ter exatamente ${input.alternativesCount} alternativas, labels sequenciais começando em A, e apenas uma alternativa correta. Use answer como null. Como a questão original não tem alternativas registradas, crie alternativas novas e plausíveis para o tema.`;

  const referenceBlock = input.referenceQuestions
    .map((q, i) => {
      const gabaritoOriginal = q.answer ?? q.answerText ?? "não informado";
      return [
        `[Questão de referência ${i + 1}] (gabarito original: ${gabaritoOriginal})`,
        q.supportText ? `Texto de apoio original:\n${q.supportText}\n` : "",
        q.statement,
        q.explanation ? `Justificativa original: ${q.explanation}` : "",
        q.trickNote ? `Pegadinha original: ${q.trickNote}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    `Matéria: ${input.subject}`,
    `Assunto: ${input.topic}`,
    `Dificuldade: ${input.difficulty}`,
    `Modo: ${input.mode ?? "ESTUDO"}`,
    formatInstruction,
    `MODO VARIAÇÃO FIEL: gere exatamente ${input.referenceQuestions.length} questão(ões) — uma variação bem próxima para CADA questão de referência abaixo, respeitando a ordem.`,
    "QUESTÕES DE REFERÊNCIA (reais, extraídas de provas anteriores):",
    referenceBlock,
    "Regras para cada variação:",
    "- Reaproveite a estrutura, o tema e boa parte do texto da questão de referência correspondente; pode manter grande parte do enunciado original, ajustando nomes, números, datas, órgãos, ordem dos itens ou pequenos detalhes de contexto.",
    "- Se a questão de referência tinha um \"Texto de apoio original\", sua variação também deve ter um texto de apoio (adaptado do original, com os mesmos ajustes de nomes/números/datas) — coloque-o no supportText do group dessa questão, não deixe null. Se a referência NÃO tinha texto de apoio, use supportText null.",
    "- Mantenha o mesmo nível de dificuldade e o mesmo tipo de pegadinha da questão original.",
    "- CRÍTICO: NÃO copie o gabarito original cegamente. Releia SOMENTE o enunciado que você reescreveu, do zero, e determine se ele é CERTO ou ERRADO (ou qual alternativa é correta) com base apenas no texto novo. Pequenas mudanças de palavra (ex.: trocar \"todos\" por \"alguns\", negar uma condição, trocar um verbo, inverter uma ordem) podem inverter o gabarito — se isso acontecer, ajuste a resposta e a justificativa para refletir o NOVO enunciado, não o original.",
    `- Preencha "sourceIndex" com o número (1 a ${input.referenceQuestions.length}) da questão de referência que serviu de base, na mesma ordem em que apareceram acima.`,
    input.prompt ? `Pedido do usuário: ${input.prompt}` : "",
    input.extraInstructions ? `Instruções adicionais: ${input.extraInstructions}` : "",
    input.context ? `Contexto do aluno (histórico/desempenho): ${input.context}` : "",
    "Use linguagem clara, objetiva e adequada a concurso.",
    "A justificativa deve explicar de forma didática por que a resposta correta está correta, considerando o enunciado que você reescreveu.",
    "Evite temas polêmicos ou desatualizados sem contexto.",
    'Estrutura da resposta: agrupe as questões em "groups" (cada group tem "supportText" e "questions"), um group por variação (supportText conforme a regra acima).',
    SELF_CONTAINMENT_INSTRUCTION,
    MATH_FORMATTING_INSTRUCTION
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateWithOpenAI(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  prompt: string
): Promise<RawGroup[]> {
  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined
  });

  const response = await openai.responses.parse({
    model: settings.model,
    input: [
      {
        role: "system",
        content:
          "Você cria questões originais para concursos públicos e sempre retorna dados estruturados válidos."
      },
      { role: "user", content: prompt }
    ],
    text: {
      format: zodTextFormat(generatedQuestionSchema, "generated_questions")
    }
  });

  if (!response.output_parsed) {
    throw new Error("A IA não retornou uma estrutura válida.");
  }

  return response.output_parsed.groups;
}

async function generateWithClaude(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  prompt: string
): Promise<RawGroup[]> {
  const response = await fetch(settings.baseUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: settings.model,
      // Folga: 4.096 era apertado para um lote no nível difícil, onde cada bloco carrega um
      // texto de apoio de 2 a 4 parágrafos além das questões. Estourar aqui não degrada — o
      // JSON vem truncado e a geração inteira falha. Só o Claude precisa do limite explícito;
      // OpenAI e OpenRouter usam o padrão do modelo, que é bem maior.
      max_tokens: 8192,
      system:
        "Você cria questões originais para concursos públicos. Use a ferramenta emit_questions para retornar apenas dados estruturados.",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "emit_questions",
          description: "Retorna uma lista validada de questões de concurso.",
          input_schema: questionsJsonSchema
        }
      ],
      tool_choice: { type: "tool", name: "emit_questions" }
    })
  });

  const data = await readJsonResponse(response);
  const toolUse = data.content?.find((block: { type?: string; name?: string }) => block.type === "tool_use" && block.name === "emit_questions");
  const parsed = generatedQuestionSchema.parse(toolUse?.input);

  return parsed.groups;
}

async function generateWithOpenRouter(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  prompt: string
): Promise<RawGroup[]> {
  const response = await fetch(settings.baseUrl || "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
      ...(settings.siteUrl ? { "HTTP-Referer": settings.siteUrl } : {}),
      ...(settings.appName ? { "X-Title": settings.appName } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "system",
          content:
            "Você cria questões originais para concursos públicos. Use a ferramenta emit_questions para retornar apenas dados estruturados."
        },
        { role: "user", content: prompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_questions",
            description: "Retorna uma lista validada de questões de concurso público.",
            parameters: questionsJsonSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "emit_questions" } }
    })
  });

  const data = await readJsonResponse(response);
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const rawArgs = toolCall?.function?.arguments;
  if (!rawArgs) throw new Error("O provedor não retornou uma chamada de ferramenta válida.");
  const parsed = generatedQuestionSchema.parse(JSON.parse(rawArgs));

  return parsed.groups;
}

function normalizeGenerated(result: {
  provider: AiProvider;
  model: string;
  prompt: string;
  groups: { supportText?: string | null; questions: z.infer<typeof generatedItemSchema>[] }[];
}) {
  // Achata os grupos em questões individuais, carregando o supportText do grupo em cada uma —
  // texto null/curto demais (placeholder inútil) vira null em vez de "quase vazio".
  const flattened: GeneratedQuestion[] = result.groups.flatMap((group) => {
    const supportText =
      group.supportText && group.supportText.trim().length >= MIN_SUPPORT_TEXT_LENGTH
        ? normalizeDisplayText(group.supportText.trim())
        : null;
    // normalizeDisplayText troca 𝐹/𝑥 (alfanumérico matemático Unicode, que vira caixinha na
    // fonte do app) por F/x e remove caracteres de controle. O modelo emite esses símbolos de
    // vez em quando, e o app já renderiza fórmula de verdade via KaTeX a partir de LaTeX.
    return group.questions.map((question) => ({
      ...question,
      supportText,
      statement: normalizeDisplayText(question.statement),
      explanation: normalizeDisplayText(question.explanation),
      options: question.options.map((option) => ({ ...option, text: normalizeDisplayText(option.text) }))
    }));
  });

  return {
    provider: result.provider,
    model: result.model,
    prompt: result.prompt,
    questions: flattened.map((question) => {
      if (question.format === "CERTO_ERRADO") {
        const answer = question.answer === "ERRADO" ? "ERRADO" : "CERTO";
        return {
          ...question,
          answer,
          options: [
            { label: "C", text: "Certo", isCorrect: answer === "CERTO" },
            { label: "E", text: "Errado", isCorrect: answer === "ERRADO" }
          ]
        };
      }

      const correctCount = question.options.filter((option) => option.isCorrect).length;
      if (correctCount !== 1) {
        throw new Error("A IA retornou questão de múltipla escolha sem exatamente uma alternativa correta.");
      }

      return {
        ...question,
        answer: null,
        options: question.options.map((option, index) => ({
          ...option,
          label: normalizeOptionLabel(option.label, index)
        }))
      };
    })
  };
}

function normalizeOptionLabel(label: string | undefined, index: number) {
  const fallback = String.fromCharCode(65 + index);
  if (!label) return fallback;
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const direct = normalized.match(/^[A-E]$/);
  if (direct) return direct[0];
  const embedded = normalized.match(/\b([A-E])\b/);
  return embedded?.[1] ?? fallback;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Provedor retornou resposta não-JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const message = data.error?.message ?? data.message ?? `Erro ${response.status} no provedor de IA.`;
    throw new Error(`[HTTP ${response.status}] ${message}`);
  }

  return data;
}

function clampAlternatives(value: number) {
  return Math.min(Math.max(Number(value) || 4, 2), 5);
}
