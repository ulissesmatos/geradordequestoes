import { Coupon, CouponType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CouponValidation =
  | { ok: true; coupon: Coupon; discountCents: number; finalAmountCents: number }
  | { ok: false; error: string };

/**
 * Desconto de um cupom sobre um valor em centavos. FIXED usa `value` em REAIS (mesma
 * convenção usada para o preço dos planos no admin) — por isso o *100 aqui. Nunca deixa
 * o valor final abaixo de R$1,00 (mesmo piso usado no crédito de upgrade em payments.ts).
 */
export function computeCouponDiscount(coupon: Pick<Coupon, "type" | "value">, priceCents: number): number {
  const raw = coupon.type === CouponType.PERCENT ? Math.round((priceCents * coupon.value) / 100) : coupon.value * 100;
  return Math.max(0, Math.min(raw, priceCents - 100));
}

/**
 * Valida um código de cupom contra o cadastro interno (Admin → Planos) e calcula o
 * desconto sobre o preço de um plano. Única fonte de verdade para cupons — usada tanto
 * no preview do modal/checkout quanto na criação real da cobrança (Stripe e Pix), nunca
 * confiando apenas em uma validação feita no cliente.
 */
export async function validateCoupon(code: string, priceCents: number): Promise<CouponValidation> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Informe um código de cupom." };

  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.isActive) return { ok: false, error: "Cupom inválido ou inativo." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return { ok: false, error: "Este cupom expirou." };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "Este cupom já atingiu o limite de usos." };
  }

  const discountCents = computeCouponDiscount(coupon, priceCents);
  if (discountCents <= 0) return { ok: false, error: "Este cupom não se aplica a este valor." };

  return { ok: true, coupon, discountCents, finalAmountCents: priceCents - discountCents };
}

/** Incrementa o contador de uso — best-effort, chamado só na confirmação real do pagamento (webhook). */
export async function incrementCouponUsage(couponId: string) {
  await prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } }).catch(() => undefined);
}
