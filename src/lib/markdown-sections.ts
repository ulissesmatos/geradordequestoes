/**
 * Localiza e altera seções de um material de estudo em markdown, espelhando a
 * semântica de headings do MarkdownContent (linhas trimadas iniciadas por
 * "## " / "### "). Usado pelo "Aprofundar" para inserir conteúdo gerado por IA
 * no fim da seção clicada.
 */

export type SectionRef = {
  level: 2 | 3;
  text: string;
  /** 0-based, contado por par (level, texto trimado) na ordem do documento. */
  occurrence: number;
};

export type SectionMatch = {
  headingLineIndex: number;
  /** Índice da primeira linha do próximo heading de nível <= level (ou lines.length). */
  endLineIndex: number;
  /** Corpo atual da seção (sem o heading), trimado. */
  sectionBody: string;
};

function headingLevelOf(trimmed: string): 1 | 2 | 3 | null {
  if (trimmed.startsWith("### ")) return 3;
  if (trimmed.startsWith("## ")) return 2;
  if (trimmed.startsWith("# ")) return 1;
  return null;
}

function headingTextOf(trimmed: string, level: 1 | 2 | 3): string {
  return trimmed.slice(level + 1).trim();
}

export function findSection(content: string, ref: SectionRef): SectionMatch | null {
  const targetText = ref.text.trim();
  if (!targetText) return null;
  const lines = content.split("\n");

  let seen = 0;
  let headingLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const level = headingLevelOf(trimmed);
    if (level !== ref.level) continue;
    if (headingTextOf(trimmed, level) !== targetText) continue;
    if (seen === ref.occurrence) {
      headingLineIndex = i;
      break;
    }
    seen++;
  }
  if (headingLineIndex === -1) return null;

  let endLineIndex = lines.length;
  for (let i = headingLineIndex + 1; i < lines.length; i++) {
    const level = headingLevelOf(lines[i].trim());
    if (level !== null && level <= ref.level) {
      endLineIndex = i;
      break;
    }
  }

  const sectionBody = lines
    .slice(headingLineIndex + 1, endLineIndex)
    .join("\n")
    .trim();

  return { headingLineIndex, endLineIndex, sectionBody };
}

export function insertIntoSection(
  content: string,
  ref: SectionRef,
  block: string
): { ok: true; content: string } | { ok: false; error: "SECTION_NOT_FOUND" } {
  const match = findSection(content, ref);
  if (!match) return { ok: false, error: "SECTION_NOT_FOUND" };

  const trimmedBlock = block.trim();
  if (!trimmedBlock) return { ok: true, content };

  const lines = content.split("\n");

  // Recua sobre linhas em branco no fim da seção, para inserir logo após o último conteúdo.
  let lastContentLine = match.endLineIndex - 1;
  while (lastContentLine > match.headingLineIndex && lines[lastContentLine].trim() === "") {
    lastContentLine--;
  }

  const before = lines.slice(0, lastContentLine + 1);
  const after = lines.slice(match.endLineIndex);
  const blockLines = trimmedBlock.split("\n");

  const result = [...before, "", ...blockLines, ...(after.length > 0 ? [""] : []), ...after];
  return { ok: true, content: result.join("\n") };
}
