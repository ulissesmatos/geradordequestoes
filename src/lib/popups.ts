import { Popup, PopupKind, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscriptions";

export type PopupPayload = {
  id: string;
  kind: PopupKind;
  title: string;
  eyebrow: string | null;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissLabel: string;
};

/**
 * Presets amigáveis de repetição pro form admin — cada um mapeia pra um valor de
 * `Popup.repeatAfterHours`: null = só 1 vez pra sempre; 0 = sempre que o app abre; N = só
 * reaparece depois de N horas desde a última exibição. Ver isEligibleByRepeatRule.
 */
export const REPEAT_PRESETS = [
  { value: "once", label: "Só uma vez", hours: null as number | null },
  { value: "always", label: "Sempre que abrir o app", hours: 0 as number | null },
  { value: "daily", label: "No máximo 1x por dia", hours: 24 as number | null },
  { value: "weekly", label: "No máximo 1x por semana", hours: 168 as number | null },
  { value: "monthly", label: "No máximo 1x por mês", hours: 720 as number | null },
  { value: "custom", label: "Personalizado (a cada N dias)", hours: null as number | null }
] as const;

export type RepeatPresetValue = (typeof REPEAT_PRESETS)[number]["value"];

/** Traduz a escolha do form (preset + dias customizados) pro inteiro salvo no banco. */
export function repeatAfterHoursFromForm(formData: FormData): number | null {
  const preset = String(formData.get("repeatPreset") ?? "once") as RepeatPresetValue;
  if (preset === "custom") {
    const days = Number(formData.get("repeatCustomDays") ?? 0);
    return days > 0 ? Math.round(days * 24) : null;
  }
  return REPEAT_PRESETS.find((p) => p.value === preset)?.hours ?? null;
}

/** Inverso de repeatAfterHoursFromForm — pré-seleciona o preset certo no form de edição. */
export function repeatPresetFromHours(hours: number | null): { preset: RepeatPresetValue; customDays: number | null } {
  if (hours === null) return { preset: "once", customDays: null };
  const preset = REPEAT_PRESETS.find((p) => p.value !== "custom" && p.hours === hours);
  if (preset) return { preset: preset.value, customDays: null };
  return { preset: "custom", customDays: Math.max(1, Math.round(hours / 24)) };
}

function isEligibleByRepeatRule(repeatAfterHours: number | null, lastShownAt: Date | null): boolean {
  if (!lastShownAt) return true;
  if (repeatAfterHours === null) return false;
  if (repeatAfterHours === 0) return true;
  const hoursSince = (Date.now() - lastShownAt.getTime()) / 3_600_000;
  return hoursSince >= repeatAfterHours;
}

function toPayload(popup: Popup): PopupPayload {
  return {
    id: popup.id,
    kind: popup.kind,
    title: popup.title,
    eyebrow: popup.eyebrow,
    body: popup.body,
    imageUrl: popup.imageUrl,
    ctaLabel: popup.ctaLabel,
    ctaUrl: popup.ctaUrl,
    dismissLabel: popup.dismissLabel
  };
}

/**
 * Popup elegível pra mostrar agora pra esse usuário, ou null. Admins nunca veem popup — são
 * equipe operando o painel, não audiência de aviso/venda. Entre vários elegíveis, só o de
 * maior `priority` é retornado (nunca empilha mais de um modal).
 */
export async function getEligiblePopupForUser(user: { id: string; role?: Role }): Promise<PopupPayload | null> {
  if (user.role === Role.ADMIN) return null;

  const now = new Date();
  const candidates = await prisma.popup.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
      ]
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
  });
  if (!candidates.length) return null;

  const paying = await hasActiveSubscription(user);
  const audienceOk = new Set(paying ? ["ALL", "PAYING"] : ["ALL", "FREE"]);
  const eligible = candidates.filter((popup) => audienceOk.has(popup.audience));
  if (!eligible.length) return null;

  const states = await prisma.popupUserState.findMany({
    where: { userId: user.id, popupId: { in: eligible.map((popup) => popup.id) } }
  });
  const lastShownByPopupId = new Map(states.map((state) => [state.popupId, state.lastShownAt]));

  for (const popup of eligible) {
    if (isEligibleByRepeatRule(popup.repeatAfterHours, lastShownByPopupId.get(popup.id) ?? null)) {
      return toPayload(popup);
    }
  }
  return null;
}
