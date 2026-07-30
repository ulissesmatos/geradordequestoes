import { Role } from "@prisma/client";
import { cache } from "react";
import { getAppSettings } from "@/lib/app-settings";
import {
  allCapabilities,
  capabilityDef,
  parseCapabilities,
  type Capabilities,
  type CapabilityKey
} from "@/lib/capabilities";
import { getActiveSubscription } from "@/lib/subscriptions";

/**
 * Resposta única para "o que este usuário pode fazer".
 *
 * Existe para concentrar num lugar só as três regras que antes estavam espalhadas: admin
 * passa por tudo, assinante segue o plano, e quem não tem assinatura segue o que o admin
 * liberou para o trial. O bypass de admin aparecia em seis arquivos diferentes — cada gate
 * novo repetia a checagem e a chance de esquecer uma crescia junto.
 */

export type EntitlementKind = "ADMIN" | "PAID" | "TRIAL";

export type Entitlements = {
  kind: EntitlementKind;
  /** Nome do plano ativo, para mensagens de upgrade. null quando não há assinatura. */
  planName: string | null;
  planId: string | null;
  capabilities: Capabilities;
  /** Feature de liga/desliga está liberada? */
  can(key: CapabilityKey): boolean;
  /** Valor de uma capability numérica. */
  intOf(key: CapabilityKey): number;
};

function build(kind: EntitlementKind, capabilities: Capabilities, plan: { id: string; name: string } | null): Entitlements {
  return {
    kind,
    planName: plan?.name ?? null,
    planId: plan?.id ?? null,
    capabilities,
    can: (key) => capabilities[key] === true,
    intOf: (key) => {
      const value = capabilities[key];
      return typeof value === "number" ? value : 0;
    }
  };
}

/**
 * Memoizado por requisição com `cache()` do React: numa renderização do chat isso era
 * consultado três ou quatro vezes, cada uma refazendo a busca da assinatura.
 */
export const getEntitlements = cache(async (user: { id: string; role?: Role }): Promise<Entitlements> => {
  if (user.role === Role.ADMIN) {
    return build("ADMIN", allCapabilities(), null);
  }

  const subscription = await getActiveSubscription(user.id);
  if (subscription) {
    return build("PAID", parseCapabilities(subscription.plan.capabilities, "plan"), {
      id: subscription.plan.id,
      name: subscription.plan.name
    });
  }

  const settings = await getAppSettings();
  return build("TRIAL", parseCapabilities(settings.trialCapabilities, "trial"), null);
});

/**
 * Resposta padrão de server action quando falta plano para uma feature.
 *
 * Formato herdado de expandMaterialSectionAction, que já devolvia `{ ok:false, upgrade:true }`
 * e tinha tratamento próprio na UI — agora é um tipo compartilhado para todo gate novo cair
 * na mesma tela de upsell em vez de cada um inventar a sua.
 */
export type UpgradeRequired = {
  ok: false;
  error: string;
  upgrade: true;
  capability: CapabilityKey;
};

export function upgradeRequired(key: CapabilityKey, message?: string): UpgradeRequired {
  return {
    ok: false,
    upgrade: true,
    capability: key,
    error: message ?? `${capabilityDef(key).label} está disponível nos planos superiores.`
  };
}

/** Versão para route handler: 402 Payment Required com o mesmo texto do upsell. */
export function upgradeRequiredResponse(key: CapabilityKey, message?: string): Response {
  const payload = upgradeRequired(key, message);
  return Response.json({ error: payload.error, upgrade: true, capability: key }, { status: 402 });
}
