"use server";

import { revalidatePath } from "next/cache";
import { BR_UF_SET } from "@/lib/br-states";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { claimTeamSeatByCode, claimTeamSeatByCpf } from "@/lib/teams";
import { isValidCpf, onlyDigits } from "@/lib/validation/cpf";

export type ProfileActionState = { ok?: boolean; error?: string } | null;

export async function updateProfileAction(_: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();

  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = onlyDigits(phoneRaw);
  if (phone && (phone.length < 10 || phone.length > 11)) {
    return { error: "Telefone inválido. Use DDD + número." };
  }

  // Se CPF já está confirmado no banco, apenas telefone pode ser alterado.
  if (user.cpf) {
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: phone || null }
    });
    revalidatePath("/perfil");
    return { ok: true };
  }

  // Fluxo de confirmação inicial: exige que o cliente tenha passado pela tela de revisão.
  const confirmed = formData.get("confirmed") === "true";
  if (!confirmed) return { error: "Confirme os dados antes de salvar." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Informe seu nome." };

  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));
  if (!cpf) return { error: "CPF é obrigatório." };
  if (!isValidCpf(cpf)) return { error: "CPF inválido. Confira os números." };

  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  if (!birthRaw) return { error: "Informe a data de nascimento." };
  const parsed = new Date(birthRaw);
  if (Number.isNaN(parsed.getTime())) return { error: "Data de nascimento inválida." };
  if (parsed.getTime() > Date.now()) return { error: "Data de nascimento não pode ser no futuro." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      cpf,
      phone: phone || null,
      birthDate: parsed
    }
  });

  // Allowlist de CPF do plano teams: ao confirmar o CPF, tenta reivindicar uma vaga.
  // Best-effort: nunca quebra o salvamento do perfil.
  try {
    await claimTeamSeatByCpf(user.id, cpf);
  } catch {
    // ignora
  }

  revalidatePath("/perfil");
  return { ok: true };
}

/** Salva os estados (UFs) de interesse do usuário para concursos. Lista vazia limpa a preferência. */
export async function updateStudyPreferencesAction(_: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();

  const raw = formData.getAll("states").map((value) => String(value).toUpperCase().trim());
  const states = [...new Set(raw)].filter((uf) => BR_UF_SET.has(uf));
  if (raw.length > 0 && states.length === 0) {
    return { error: "Estados inválidos. Tente novamente." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredStates: states }
  });

  revalidatePath("/perfil");
  revalidatePath("/ai");
  return { ok: true };
}

/** Atalho de 1 clique (banner do chat) para definir os estados de interesse. */
export async function setPreferredStatesQuickAction(ufs: string[]) {
  const user = await requireUser();
  const states = [...new Set(ufs.map((uf) => uf.toUpperCase().trim()))].filter((uf) => BR_UF_SET.has(uf));
  if (!states.length) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredStates: states }
  });

  revalidatePath("/ai");
  revalidatePath("/perfil");
}

/** Preferências de constância: meta diária e e-mails (checkbox marcado = quer receber). */
export async function updateNotificationPrefsAction(
  _: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const user = await requireUser();

  const goalRaw = String(formData.get("dailyQuestionGoal") ?? "").trim();
  const goal = goalRaw ? Number(goalRaw) : null;
  if (goal !== null && (!Number.isInteger(goal) || goal < 1 || goal > 500)) {
    return { error: "Meta diária inválida — use um número entre 1 e 500 (ou deixe em branco)." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      dailyQuestionGoal: goal,
      reviewReminderOptOut: formData.get("reviewReminder") !== "on",
      weeklySummaryOptOut: formData.get("weeklySummary") !== "on"
    }
  });
  revalidatePath("/perfil");
  revalidatePath("/desempenho");
  return { ok: true };
}

export type RedeemCodeState = { ok?: boolean; error?: string; message?: string } | null;

/** Resgata um código de convite de empresa (plano teams) e ativa o acesso premium. */
export async function redeemTeamCodeAction(_: RedeemCodeState, formData: FormData): Promise<RedeemCodeState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Informe o código." };

  const result = await claimTeamSeatByCode(user.id, code);
  if (result.ok) {
    revalidatePath("/perfil");
    return { ok: true, message: "Código aplicado! Seu acesso premium foi ativado." };
  }
  const messages: Record<string, string> = {
    not_found: "Código inválido ou não encontrado.",
    already_claimed: "Este código já foi utilizado por outra conta.",
    team_inactive: "O pacote desta empresa não está ativo no momento.",
    full: "Este pacote já atingiu o limite de vagas."
  };
  return { error: messages[result.reason] ?? "Não foi possível aplicar o código." };
}
