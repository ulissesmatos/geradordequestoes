"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Cpu, Loader2 } from "lucide-react";
import { updateExtractionModelAction } from "@/app/admin/referencias/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ModelOption } from "@/lib/ai/model-catalog";

const CUSTOM = "__custom__";

/**
 * Seletor do modelo de IA usado na extração de questões das referências.
 * A escolha fica salva (AiProviderSetting.extractionModel) e vale para todos
 * os processamentos. Dica: use um modelo forte aqui — a extração roda uma vez
 * por material e define a qualidade do banco que o chat consulta depois.
 *
 * Chama a action diretamente (em vez de <form action={...}>) e força
 * router.refresh() depois: o padrão de form action "solto" deixava a tela
 * às vezes mostrando o valor antigo mesmo com o salvamento já persistido no
 * banco (cache do router não invalidava sem uma navegação de verdade).
 */
export function ExtractionModelPicker({
  providerName,
  defaultModel,
  currentModel,
  options
}: {
  providerName: string;
  defaultModel: string;
  currentModel: string;
  options: ModelOption[];
}) {
  const router = useRouter();
  const isCustomSaved = !!currentModel && !options.some((o) => o.value === currentModel);
  const [choice, setChoice] = useState(isCustomSaved ? CUSTOM : currentModel);
  const [customValue, setCustomValue] = useState(isCustomSaved ? currentModel : "");
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingValue = choice === CUSTOM ? customValue.trim() : choice;

  function save() {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("model", pendingValue);
        await updateExtractionModelAction(formData);
        router.refresh();
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]">
        <Cpu className="h-4 w-4 text-[var(--primary)]" />
        IA da extração
        <span className="font-normal">({providerName})</span>
      </span>
      <Select
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
          setJustSaved(false);
        }}
        className="h-9 w-auto min-w-[220px] text-sm"
      >
        <option value="">Padrão configurado ({defaultModel})</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value={CUSTOM}>Outro (digitar ID)</option>
      </Select>
      {choice === CUSTOM && (
        <Input
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            setJustSaved(false);
          }}
          placeholder="ID do modelo"
          className="h-9 w-48 text-sm"
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={save}
        disabled={pending || (choice === CUSTOM && !customValue.trim())}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : justSaved ? <Check className="h-3.5 w-3.5" /> : null}
        {justSaved ? "Salvo" : "Salvar"}
      </Button>
      {error && <span className="text-xs font-medium text-[var(--destructive)]">{error}</span>}
    </div>
  );
}
