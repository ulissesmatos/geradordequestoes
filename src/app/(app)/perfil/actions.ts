"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
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

  revalidatePath("/perfil");
  return { ok: true };
}
