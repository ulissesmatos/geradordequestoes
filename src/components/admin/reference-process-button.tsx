"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, ScanText } from "lucide-react";
import { processReferenceBatchAction } from "@/app/admin/referencias/actions";
import { cn } from "@/lib/utils";

/**
 * Dispara a extração por IA em lotes, chamando a action repetidamente até
 * terminar — com barra de progresso real (trechos processados e questões).
 */
export function ReferenceProcessButton({
  documentId,
  totalChunks,
  initialProcessed = 0,
  label = "Processar com IA",
  variant = "primary"
}: {
  documentId: string;
  totalChunks: number;
  initialProcessed?: number;
  label?: string;
  /** "secondary" usa estilo discreto — para kinds onde a extração de questões é opcional (ex.: editais). */
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; extracted: number }>({
    processed: initialProcessed,
    extracted: 0
  });
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  async function run() {
    setRunning(true);
    setError(null);
    cancelledRef.current = false;
    try {
      // Loop de lotes: cada chamada processa ~8 trechos no servidor.
      for (let guard = 0; guard < 500; guard += 1) {
        const result = await processReferenceBatchAction(documentId);
        setProgress({ processed: result.processedChunks, extracted: result.extractedTotal });
        if (result.error) {
          setError(result.error);
          break;
        }
        if (result.done) {
          setFinished(true);
          break;
        }
        if (cancelledRef.current) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const percent = totalChunks > 0 ? Math.round((progress.processed / totalChunks) * 100) : 0;

  if (finished && !error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 animate-fade-in">
        <CheckCircle2 className="h-4 w-4" />
        {progress.extracted} questões extraídas
      </span>
    );
  }

  return (
    <div className="flex w-full max-w-[230px] flex-col gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition",
          running
            ? "pointer-events-none border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]"
            : variant === "secondary"
              ? "border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
              : "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:bg-[var(--primary-hover)]"
        )}
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
        {running ? `${percent}% · ${progress.extracted} questões` : label}
      </button>
      {running && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
            style={{ width: `${Math.max(percent, 4)}%` }}
          />
        </div>
      )}
      {error && (
        <span className="inline-flex items-start gap-1 text-left text-xs font-medium text-[var(--destructive)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-3">{error}</span>
        </span>
      )}
    </div>
  );
}
