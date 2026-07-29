"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { validateCoupon } from "@/lib/coupons";
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
  const couponCode = String(formData.get("coupon") ?? "").trim();
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));

  if (!isValidCpf(cpf)) return { error: "CPF inválido. Confira os números." };

  await prisma.user.update({ where: { id: user.id }, data: { cpf } });

  const params = new URLSearchParams({ plan: planSlug });
  if (couponCode) params.set("coupon", couponCode);
  redirect(`/checkout/mercado-pago?${params.toString()}`);
}

export type CouponPreview =
  | { ok: true; code: string; discountLabel: string; finalPriceLabel: string }
  | { ok: false; error: string };

/**
 * Preview de cupom exibido no modal de pagamento antes de escolher Stripe ou Pix.
 * Só um preview: o valor real do desconto é recalculado e travado de novo no
 * servidor ao criar o checkout (stripe/page.tsx e mercado-pago/page.tsx) — nunca
 * confiamos no que veio do cliente para decidir o valor cobrado.
 */
export async function validateCouponAction(planSlug: string, code: string): Promise<CouponPreview> {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug, isActive: true } });
  if (!plan) return { ok: false, error: "Plano não encontrado." };

  const result = await validateCoupon(code, plan.priceCents);
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    code: result.coupon.code,
    discountLabel: formatMoney(result.discountCents),
    finalPriceLabel: formatMoney(result.finalAmountCents)
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
