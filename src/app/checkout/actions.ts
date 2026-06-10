"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { isValidCpf, onlyDigits } from "@/lib/validation/cpf";

export type CheckoutCpfState = { error?: string } | null;

/**
 * Salva o CPF do usuário e retorna ao checkout Pix do plano, que então
 * prossegue (agora com CPF disponível para enviar ao Mercado Pago).
 */
export async function saveCheckoutCpfAction(_: CheckoutCpfState, formData: FormData): Promise<CheckoutCpfState> {
  const user = await requireUser();
  const planSlug = String(formData.get("plan") ?? "").trim();
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));

  if (!isValidCpf(cpf)) return { error: "CPF inválido. Confira os números." };

  await prisma.user.update({ where: { id: user.id }, data: { cpf } });

  redirect(`/checkout/mercado-pago?plan=${encodeURIComponent(planSlug)}`);
}
