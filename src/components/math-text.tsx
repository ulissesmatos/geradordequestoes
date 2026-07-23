import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment } from "react";

export type MathSegment =
  | { type: "text"; content: string }
  | { type: "inline" | "block"; content: string };

// Delimitadores \( \) e \[ \] (não $ $) para não colidir com "R$" em textos de concurso.
const MATH_PATTERN = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

/** Separa texto normal de trechos \(...\)/\[...\] — reaproveitado por MathText e MarkdownContent. */
export function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MATH_PATTERN.lastIndex = 0;
  while ((match = MATH_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: "block", content: match[1] });
    } else {
      segments.push({ type: "inline", content: match[2] as string });
    }
    lastIndex = MATH_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

/** Renderiza uma fórmula LaTeX pra HTML (KaTeX); null se o KaTeX não conseguir processar. */
export function renderKatexHtml(source: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(source, {
      throwOnError: false,
      displayMode,
      strict: "ignore"
    });
  } catch {
    return null;
  }
}

/**
 * Renderiza texto com fórmulas LaTeX inline (\(...\)) e em bloco (\[...\]) via KaTeX;
 * o restante do texto passa direto. Seguro em componentes de servidor (katex.renderToString
 * não toca no DOM) e determinístico entre servidor/cliente, sem risco de mismatch de hidratação.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  if (!text.includes("\\(") && !text.includes("\\[")) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const segments = splitMathSegments(text);
  const content = segments.map((segment, index) => {
    if (segment.type === "text") {
      return <Fragment key={index}>{segment.content}</Fragment>;
    }
    const html = renderKatexHtml(segment.content, segment.type === "block");
    if (html == null) {
      const raw = segment.type === "block" ? `\\[${segment.content}\\]` : `\\(${segment.content}\\)`;
      return <Fragment key={index}>{raw}</Fragment>;
    }
    return segment.type === "block" ? (
      <span key={index} className="my-1 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <span key={index} dangerouslySetInnerHTML={{ __html: html }} />
    );
  });

  return <span className={className}>{content}</span>;
}
