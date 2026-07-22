import { NextResponse } from "next/server";
import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_MAX_AGE } from "@/lib/affiliates";
import { appUrl } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Link de afiliado: /r/<code> grava o cookie de atribuição (30 dias) e leva
 * para a landing. Código inválido/inativo só redireciona, sem cookie.
 */
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const response = NextResponse.redirect(new URL("/", appUrl()));

  const profile = await prisma.affiliateProfile.findUnique({
    where: { code: code.trim() },
    select: { isActive: true }
  });
  if (profile?.isActive) {
    response.cookies.set(AFFILIATE_COOKIE, code.trim(), {
      maxAge: AFFILIATE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  }
  return response;
}
