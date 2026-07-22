"use server";

import { revalidatePath } from "next/cache";
import { getAffiliateBalance, MIN_WITHDRAWAL_CENTS } from "@/lib/affiliates";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export type WithdrawalActionState = { ok?: boolean; error?: string } | null;

/** Solicita um saque via Pix do saldo disponível de comissões. */
export async function requestAffiliateWithdrawalAction(
  _: WithdrawalActionState,
  formData: FormData
): Promise<WithdrawalActionState> {
  const user = await requireUser();

  const profile = await prisma.affiliateProfile.findUnique({ where: { userId: user.id } });
  if (!profile || !profile.isActive) {
    return { error: "Sua conta não participa do programa de afiliados." };
  }

  const amountReais = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const amountCents = Math.round(amountReais * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { error: "Informe um valor de saque válido." };
  }
  if (amountCents < MIN_WITHDRAWAL_CENTS) {
    return { error: `O saque mínimo é R$ ${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2).replace(".", ",")}.` };
  }

  const pixKey = String(formData.get("pixKey") ?? "").trim();
  if (pixKey.length < 5 || pixKey.length > 140) {
    return { error: "Informe a chave Pix para receber o pagamento." };
  }

  const balance = await getAffiliateBalance(profile.id);
  if (amountCents > balance.availableCents) {
    return { error: "Valor acima do saldo disponível." };
  }

  await prisma.affiliateWithdrawal.create({
    data: { affiliateId: profile.id, amountCents, pixKey }
  });

  revalidatePath("/afiliado");
  return { ok: true };
}
