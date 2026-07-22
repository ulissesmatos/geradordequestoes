import type { ReactNode } from "react";

export type HeadingInfo = {
  level: 2 | 3;
  /** Texto cru do título (antes do parse de **negrito**) — igual ao que o servidor compara. */
  text: string;
  /** 0-based, contado por par (level, texto) na ordem do documento. */
  occurrence: number;
};

export function MarkdownContent({
  content,
  compact = false,
  headingAccessory
}: {
  content: string;
  compact?: boolean;
  /** Renderiza um acessório (ex.: botão "Aprofundar") ao lado de títulos ## e ###. */
  headingAccessory?: (info: HeadingInfo) => ReactNode;
}) {
  const lines = normalizeContent(content).split("\n");
  const blocks: ReactNode[] = [];
  const headingCounts = new Map<string, number>();

  function nextHeadingInfo(level: 2 | 3, rawText: string): HeadingInfo {
    const key = `${level}:${rawText}`;
    const occurrence = headingCounts.get(key) ?? 0;
    headingCounts.set(key, occurrence + 1);
    return { level, text: rawText, occurrence };
  }
  let bulletItems: string[] = [];
  let numberedItems: Array<{ number: number; text: string }> = [];
  let tableRows: string[][] = [];
  let tableHasHeader = false;
  let nextOrderedNumber = 1;

  function flushBullets() {
    if (!bulletItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {bulletItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    bulletItems = [];
  }

  function flushNumbers() {
    if (!numberedItems.length) return;
    blocks.push(
      <div key={`ol-${blocks.length}`} className="space-y-2">
        {numberedItems.map((item, index) => (
          <div key={`${item.number}-${item.text}-${index}`} className="grid grid-cols-[1.25rem_1fr] gap-1">
            <span className="text-right tabular-nums">{item.number}.</span>
            <div>{renderInline(item.text)}</div>
          </div>
        ))}
      </div>
    );
    numberedItems = [];
  }

  function flushTable() {
    if (!tableRows.length) return;
    const [headerRow, ...bodyRows] = tableRows;
    blocks.push(
      <div key={`table-${blocks.length}`} className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {tableHasHeader && headerRow && (
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)]">
                {headerRow.map((cell, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold">{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(tableHasHeader ? bodyRows : tableRows).map((row, ri) => (
              <tr key={ri} className="border-b border-[var(--border)] last:border-0 even:bg-[var(--surface-subtle)]">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2">{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    tableHasHeader = false;
  }

  function flushLists() {
    flushBullets();
    flushNumbers();
  }

  function flushAll() {
    flushLists();
    flushTable();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Table row
    if (line.startsWith("|") && line.endsWith("|")) {
      flushLists();
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // Separator row: |---|---|
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        if (tableRows.length === 1) tableHasHeader = true;
        continue;
      }
      tableRows.push(cells);
      continue;
    }

    // Non-table line → flush any pending table first
    if (tableRows.length) flushTable();

    if (!line) {
      flushLists();
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      flushLists();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-[var(--border)]" />);
      continue;
    }
    if (line.startsWith("### ")) {
      flushLists();
      const info = nextHeadingInfo(3, line.slice(4).trim());
      blocks.push(
        headingAccessory ? (
          <h3 key={`h3-${blocks.length}`} className="group flex items-center gap-2 text-lg font-semibold">
            <span>{renderInline(line.slice(4))}</span>
            {headingAccessory(info)}
          </h3>
        ) : (
          <h3 key={`h3-${blocks.length}`} className="text-lg font-semibold">{renderInline(line.slice(4))}</h3>
        )
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushLists();
      const info = nextHeadingInfo(2, line.slice(3).trim());
      blocks.push(
        headingAccessory ? (
          <h2 key={`h2-${blocks.length}`} className="group flex items-center gap-2 pt-2 text-2xl font-semibold">
            <span>{renderInline(line.slice(3))}</span>
            {headingAccessory(info)}
          </h2>
        ) : (
          <h2 key={`h2-${blocks.length}`} className="pt-2 text-2xl font-semibold">{renderInline(line.slice(3))}</h2>
        )
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushLists();
      blocks.push(<h1 key={`h1-${blocks.length}`} className="text-3xl font-bold">{renderInline(line.slice(2))}</h1>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushNumbers();
      bulletItems.push(bullet[1]);
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushBullets();
      const sourceNumber = Number(numbered[1]);
      const displayNumber = sourceNumber === 1 && nextOrderedNumber > 1 ? nextOrderedNumber : sourceNumber;
      numberedItems.push({ number: displayNumber, text: numbered[2] });
      nextOrderedNumber = displayNumber + 1;
      continue;
    }
    flushLists();
    blocks.push(<p key={`p-${blocks.length}`} className={compact ? undefined : "leading-7"}>{renderInline(line)}</p>);
  }
  flushAll();

  return <div className={compact ? "space-y-3" : "space-y-4"}>{blocks.length ? blocks : <p>{content}</p>}</div>;
}

function normalizeContent(content: string) {
  let text = content.trim();

  // Algumas respostas de IA vêm com listas inline ("texto - item - item") sem quebras de linha.
  if (!text.includes("\n") && /\s-\s+/.test(text)) {
    text = text
      .replace(/:\s+-\s+/g, ":\n- ")
      .replace(/\s+-\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/g, "\n- ");
  }

  return text.replace(/\n{3,}/g, "\n\n");
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
