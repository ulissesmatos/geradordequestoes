import { Difficulty, ExpenseCategory, MarketingChannel, QuestionFormat, QuestionSetMode } from "@prisma/client";

export function questionSetModeLabel(mode: QuestionSetMode) {
  return {
    [QuestionSetMode.ESTUDO]: "Estudo",
    [QuestionSetMode.SIMULADO]: "Simulado",
    [QuestionSetMode.REVISAO]: "Revisão"
  }[mode];
}

export function questionFormatLabel(format: QuestionFormat) {
  return {
    [QuestionFormat.CERTO_ERRADO]: "Certo/Errado",
    [QuestionFormat.MULTIPLA_ESCOLHA]: "Múltipla escolha"
  }[format];
}

export function difficultyLabel(difficulty: Difficulty) {
  return {
    [Difficulty.FACIL]: "Fácil",
    [Difficulty.MEDIO]: "Médio",
    [Difficulty.DIFICIL]: "Difícil"
  }[difficulty];
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.MARKETING]: "Marketing",
  [ExpenseCategory.INFRAESTRUTURA]: "Infraestrutura",
  [ExpenseCategory.FERRAMENTAS_SAAS]: "Ferramentas & SaaS",
  [ExpenseCategory.FOLHA_PESSOAL]: "Folha & pessoal",
  [ExpenseCategory.TAXAS_GATEWAY]: "Taxas de gateway",
  [ExpenseCategory.IMPOSTOS]: "Impostos",
  [ExpenseCategory.JURIDICO_CONTABILIDADE]: "Jurídico & contabilidade",
  [ExpenseCategory.DISTRIBUICAO_LUCROS]: "Distribuição de lucros (sócios)",
  [ExpenseCategory.OUTROS]: "Outros"
};

export function expenseCategoryLabel(category: ExpenseCategory) {
  return EXPENSE_CATEGORY_LABELS[category];
}

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  [MarketingChannel.GOOGLE_ADS]: "Google Ads",
  [MarketingChannel.META_ADS]: "Meta Ads (Facebook/Instagram)",
  [MarketingChannel.TIKTOK_ADS]: "TikTok Ads",
  [MarketingChannel.YOUTUBE_ADS]: "YouTube Ads",
  [MarketingChannel.ORGANICO_SOCIAL]: "Orgânico (redes sociais)",
  [MarketingChannel.EMAIL]: "E-mail marketing",
  [MarketingChannel.SEO]: "SEO",
  [MarketingChannel.AFILIADOS]: "Afiliados",
  [MarketingChannel.INDICACAO]: "Indicação",
  [MarketingChannel.OUTRO]: "Outro"
};

export function marketingChannelLabel(channel: MarketingChannel) {
  return MARKETING_CHANNEL_LABELS[channel];
}
