import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isBlocked: true,
      stripeCustomerId: true,
      emailVerified: true,
      image: true,
      cpf: true,
      birthDate: true,
      phone: true,
      preferredStates: true,
      reviewReminderOptOut: true,
      dailyQuestionGoal: true,
      weeklySummaryOptOut: true
    }
  });

  if (!user || user.isBlocked) redirect("/login?error=blocked");
  return user;
}

/**
 * Sessão JWT presente (cookie ainda não expirou) E a conta continua válida no banco (existe,
 * não está bloqueada). As páginas de auth (login, recuperar/redefinir senha) usavam só
 * `session?.user` pra decidir se já tem sessão e mandar pro painel — mas isso não bate com
 * `requireUser`, que TAMBÉM confere o banco. Resultado: um usuário bloqueado ou apagado com
 * sessão ainda válida ficava preso num loop — `requireUser` manda pro /login por não achar
 * ele no banco, e /login manda de volta pro painel só de ver a sessão, sem checar nada.
 * Aqui as duas checagens usam o MESMO critério, então o loop não existe mais: quem cai
 * aqui com sessão inválida simplesmente vê a tela de login normal, em vez de ricochetear.
 */
export async function hasValidSession(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isBlocked: true } });
  return user != null && !user.isBlocked;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) redirect("/ai");
  return user;
}
