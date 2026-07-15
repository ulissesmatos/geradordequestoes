import { AiProvider } from "@prisma/client";

/**
 * Catálogo de modelos selecionáveis por provedor (usa a mesma API key já
 * configurada no admin). Lista curada de opções baratas e caras; o admin
 * também pode digitar um ID de modelo manualmente ("Outro").
 */

export type ModelOption = {
  value: string;
  label: string;
};

const ANTHROPIC_MODELS: ModelOption[] = [
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 — rápido e econômico" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — equilíbrio (recomendado)" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8 — máxima qualidade" }
];

const OPENAI_MODELS: ModelOption[] = [
  { value: "gpt-4.1-nano", label: "GPT-4.1 nano — mais barato" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini — econômico" },
  { value: "gpt-4o", label: "GPT-4o — qualidade alta" },
  { value: "gpt-4.1", label: "GPT-4.1 — máxima qualidade" }
];

const OPENROUTER_MODELS: ModelOption[] = [
  { value: "openai/gpt-4.1-mini", label: "OpenAI GPT-4.1 mini — econômico" },
  { value: "openai/gpt-4.1", label: "OpenAI GPT-4.1 — qualidade alta" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 — rápido e econômico" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 — equilíbrio" },
  { value: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8 — máxima qualidade" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash — rápido e econômico" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro — qualidade alta" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek V3 — custo-benefício" },
  { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — open source" }
];

export function getModelOptionsForProvider(provider: AiProvider): ModelOption[] {
  if (provider === AiProvider.CLAUDE) return ANTHROPIC_MODELS;
  if (provider === AiProvider.OPENROUTER) return OPENROUTER_MODELS;
  return OPENAI_MODELS;
}

/** Validação leve de IDs de modelo digitados manualmente. */
export function isValidModelId(value: string): boolean {
  return /^[\w.\/:-]{2,100}$/.test(value);
}
