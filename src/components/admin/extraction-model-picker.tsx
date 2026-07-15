"use client";

import { useState } from "react";
import { Cpu } from "lucide-react";
import { updateExtractionModelAction } from "@/app/admin/referencias/actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ModelOption } from "@/lib/ai/model-catalog";

const CUSTOM = "__custom__";

/**
 * Seletor do modelo de IA usado na extração de questões das referências.
 * A escolha fica salva (AiProviderSetting.extractionModel) e vale para todos
 * os processamentos. Dica: use um modelo forte aqui — a extração roda uma vez
 * por material e define a qualidade do banco que o chat consulta depois.
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
  const isCustomSaved = !!currentModel && !options.some((o) => o.value === currentModel);
  const [choice, setChoice] = useState(isCustomSaved ? CUSTOM : currentModel);

  return (
    <form action={updateExtractionModelAction} className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]">
        <Cpu className="h-4 w-4 text-[var(--primary)]" />
        IA da extração
        <span className="font-normal">({providerName})</span>
      </span>
      <Select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="h-9 w-auto min-w-[220px] text-sm"
        {...(choice !== CUSTOM ? { name: "model" } : {})}
      >
        <option value="">Padrão configurado ({defaultModel})</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value={CUSTOM}>Outro (digitar ID)</option>
      </Select>
      {choice === CUSTOM && (
        <Input
          name="model"
          defaultValue={isCustomSaved ? currentModel : ""}
          placeholder="ID do modelo"
          required
          className="h-9 w-48 text-sm"
        />
      )}
      <SubmitButton variant="outline" size="sm">Salvar</SubmitButton>
    </form>
  );
}
