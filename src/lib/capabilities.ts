/**
 * Registry de capabilities: a lista única do que um plano pode ligar/desligar.
 *
 * Como usar: para criar uma feature paga nova, acrescente UMA entrada aqui e chame
 * `ent.can("suaChave")` no gate de servidor. O formulário do admin, os defaults e os
 * bullets do card de preço se atualizam sozinhos — nada de migration, nada de editar
 * seis arquivos e descobrir depois que um deles ficou para trás.
 *
 * Por que registry em código + JSON no banco, e não uma coluna por feature: com coluna,
 * cada feature nova exige mexer em schema, seed, createPlanAction, updatePlanAction, no
 * formulário e nos bullets. E `updatePlanAction` grava a lista inteira de campos de uma
 * vez, então uma coluna esquecida ali nunca persiste — em silêncio, sem erro nenhum.
 *
 * Limites numéricos VENDIDOS (cota mensal, teto diário, tamanho do bloco) não moram aqui:
 * são colunas de verdade em SubscriptionPlan, porque entram em relatório e ordenação.
 * Aqui ficam o liga/desliga e parâmetros pequenos de comportamento.
 */

export type CapabilityType = "boolean" | "int";

export type CapabilityDef = {
  /** Rótulo do campo no admin. */
  label: string;
  /** Explicação curta sob o campo — o admin precisa saber o que desligar quebra. */
  helpText: string;
  type: CapabilityType;
  /** Valor para plano pago que ainda não gravou esta chave (plano legado ou recém-criado). */
  planDefault: boolean | number;
  /** Valor para quem não tem assinatura. É aqui que se decide o que a conta grátis vê. */
  trialDefault: boolean | number;
  /**
   * Bullet gerado automaticamente no card de preço quando a capability está ligada.
   * `{value}` é interpolado nas do tipo int. `null` = não vira argumento de venda.
   */
  marketingBullet: string | null;
};

export const CAPABILITIES = {
  chatAttachments: {
    label: "Anexos no chat (PDF e imagem)",
    helpText:
      "Permite enviar edital, prova ou foto no chat e gerar questões a partir do próprio material. Tem custo real de processamento e armazenamento.",
    type: "boolean",
    planDefault: true,
    trialDefault: false,
    marketingBullet: "Envie PDF, edital ou foto e gere questões do seu próprio material"
  },
  materialExpand: {
    label: "Aprofundar materiais com IA",
    helpText: "Botão que expande uma seção do material de estudo com mais detalhe, gastando uma chamada de IA.",
    type: "boolean",
    planDefault: false,
    trialDefault: false,
    marketingBullet: "Aprofundar qualquer trecho do material com IA"
  },
  materialPdfExport: {
    label: "Exportar material em PDF",
    helpText: "Download do material de estudo em PDF para imprimir ou ler offline.",
    type: "boolean",
    planDefault: true,
    trialDefault: true,
    marketingBullet: "Baixe seus materiais em PDF"
  },
  mockExams: {
    label: "Simulados cronometrados",
    helpText: "Acesso à área de simulados com tempo, nota líquida e correção no padrão da banca.",
    type: "boolean",
    planDefault: true,
    trialDefault: true,
    marketingBullet: "Simulados cronometrados com nota líquida"
  },
  closeVariant: {
    label: "Variação fiel de provas reais",
    helpText:
      "Opção de gerar variações bem próximas das questões reais do acervo, em vez de apenas se inspirar no estilo da banca.",
    type: "boolean",
    planDefault: true,
    trialDefault: true,
    marketingBullet: "Questões em variação fiel de provas reais do acervo"
  },
  referenceLibrary: {
    label: "Consulta ao acervo interno",
    helpText:
      "Deixa a IA consultar provas, editais, leis e apostilas cadastradas para fundamentar respostas e conferir gabaritos.",
    type: "boolean",
    planDefault: true,
    trialDefault: true,
    marketingBullet: "IA consulta o acervo de provas, editais e leis da plataforma"
  },
  webSearch: {
    label: "Busca na web no chat",
    helpText:
      "Deixa a IA buscar informação atual na internet (editais, datas, mudanças de lei). Depende da busca estar ligada em Admin → IA.",
    type: "boolean",
    planDefault: true,
    trialDefault: true,
    marketingBullet: "Busca na web para editais e informações recentes"
  },
  premiumModel: {
    label: "Modelo de IA avançado",
    helpText:
      "Usa o modelo superior configurado em Admin → IA para gerar questões deste plano. Sem modelo configurado, não muda nada.",
    type: "boolean",
    planDefault: false,
    trialDefault: false,
    marketingBullet: "Geração com o modelo de IA mais avançado"
  },
  reviewSessionLimit: {
    label: "Questões por sessão de revisão",
    helpText: "Quantas questões vencidas entram de uma vez numa sessão de revisão espaçada.",
    type: "int",
    planDefault: 20,
    trialDefault: 20,
    marketingBullet: null
  }
} as const satisfies Record<string, CapabilityDef>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** Valor resolvido de cada capability: boolean nas de liga/desliga, number nas de parâmetro. */
export type Capabilities = {
  [K in CapabilityKey]: (typeof CAPABILITIES)[K]["type"] extends "int" ? number : boolean;
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

export function capabilityDef(key: CapabilityKey): CapabilityDef {
  return CAPABILITIES[key];
}

/**
 * Lê o JSON gravado no plano (ou nas configurações do trial) preenchendo o que faltar.
 *
 * Duas propriedades importantes: chave AUSENTE cai no default — então adicionar uma
 * capability nova não exige tocar em nenhum plano existente; e chave DESCONHECIDA é
 * ignorada — então remover uma do registry não quebra planos com JSON antigo.
 */
export function parseCapabilities(raw: unknown, defaults: "plan" | "trial"): Capabilities {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const resolved: Record<string, boolean | number> = {};

  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key] as CapabilityDef;
    const fallback = defaults === "trial" ? def.trialDefault : def.planDefault;
    const value = source[key];

    if (def.type === "int") {
      const parsed = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
      resolved[key] = parsed ?? (fallback as number);
    } else {
      resolved[key] = typeof value === "boolean" ? value : (fallback as boolean);
    }
  }

  return resolved as Capabilities;
}

/**
 * Tudo liberado — usado para o admin, que não passa por plano.
 *
 * As de tipo int caem no `planDefault` em vez de "infinito": elas viram `take` de query
 * e limite de tela, então um número absurdo quebraria em vez de liberar.
 */
export function allCapabilities(): Capabilities {
  const resolved: Record<string, boolean | number> = {};
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key] as CapabilityDef;
    resolved[key] = def.type === "int" ? (def.planDefault as number) : true;
  }
  return resolved as Capabilities;
}

/** Serializa para gravar no banco, mantendo só as chaves conhecidas. */
export function serializeCapabilities(values: Capabilities): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const key of CAPABILITY_KEYS) out[key] = values[key];
  return out;
}

/**
 * Lê as capabilities de um formulário do admin (campos `cap:<chave>`).
 *
 * Itera o REGISTRY, nunca o FormData: checkbox desmarcado não é enviado no POST, então
 * quem varre o FormData nunca consegue DESLIGAR nada — a feature ficaria ligada para
 * sempre, e o admin não entenderia por quê.
 *
 * Devolve `null` quando o formulário não trouxe o fieldset (falta `capabilitiesSubmitted`),
 * para quem chama preservar o que já estava gravado. Sem essa distinção, um formulário
 * futuro que não renderize o fieldset apagaria todas as capabilities do plano em silêncio.
 */
export function readCapabilitiesFromForm(
  formData: Pick<FormData, "get" | "has">,
  defaults: "plan" | "trial" = "plan"
): Record<string, boolean | number> | null {
  if (!formData.has("capabilitiesSubmitted")) return null;

  const values: Record<string, boolean | number> = {};
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key] as CapabilityDef;
    const fallback = defaults === "trial" ? def.trialDefault : def.planDefault;
    const raw = formData.get(`cap:${key}`);
    if (def.type === "int") {
      const parsed = Math.trunc(Number(raw ?? fallback));
      values[key] = Number.isFinite(parsed) ? Math.max(0, parsed) : (fallback as number);
    } else {
      values[key] = raw === "on";
    }
  }
  return values;
}
