"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { isValidCpf, onlyDigits } from "@/lib/validation/cpf";

export type ProfileActionState = { ok?: boolean; error?: string } | null;

export async function updateProfileAction(_: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const cpfRaw = String(formData.get("cpf") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "");
  const birthRaw = String(formData.get("birthDate") ?? "").trim();

  if (name.length < 2) return { error: "Informe seu nome." };

  const cpf = onlyDigits(cpfRaw);
  if (cpf && !isValidCpf(cpf)) return { error: "CPF inválido. Confira os números." };

  const phone = onlyDigits(phoneRaw);
  if (phone && (phone.length < 10 || phone.length > 11)) {
    return { error: "Telefone inválido. Use DDD + número." };
  }

  let birthDate: Date | null = null;
  if (birthRaw) {
    const parsed = new Date(birthRaw);
    if (Number.isNaN(parsed.getTime())) return { error: "Data de nascimento inválida." };
    if (parsed.getTime() > Date.now()) return { error: "Data de nascimento não pode ser no futuro." };
    birthDate = parsed;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      cpf: cpf || null,
      phone: phone || null,
      birthDate
    }
  });

  revalidatePath("/perfil");
  return { ok: true };
}
