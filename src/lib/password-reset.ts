import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmailTemplate } from "@/lib/email/templates";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minuto entre envios

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export type IssueResetCodeResult =
  | { sent: true }
  | { sent: false; reason: "no_account" | "no_password" | "cooldown" | "email_failed" };

/**
 * Emite um código de redefinição de senha. Retorna um resultado detalhado, mas o
 * fluxo PÚBLICO (requestPasswordResetAction) ignora esse retorno e sempre responde
 * com sucesso genérico — é o admin (adminSendPasswordResetCodeAction) que usa o
 * detalhe, já que ali não há risco de enumeração (o admin já sabe quem é o usuário).
 * Só envia de fato quando a conta existe e tem senha (contas só-Google não têm o
 * que redefinir). Best-effort no envio: falha de e-mail não derruba o fluxo público.
 */
export async function issuePasswordResetCode(emailRaw: string): Promise<IssueResetCodeResult> {
  const email = (emailRaw ?? "").trim().toLowerCase();
  if (!email) return { sent: false, reason: "no_account" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true }
  });
  if (!user) return { sent: false, reason: "no_account" };
  if (!user.passwordHash) return { sent: false, reason: "no_password" };

  // Cooldown anti-spam.
  const last = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false, reason: "cooldown" };
  }

  const code = generateCode();
  await prisma.passwordResetCode.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() }
  });
  await prisma.passwordResetCode.create({
    data: { userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) }
  });

  try {
    const appSettings = await getAppSettings();
    const template = passwordResetEmailTemplate(code, appSettings.appName);
    const result = await sendEmail({ to: user.email, subject: template.subject, html: template.html, text: template.text });
    if (!result.ok) return { sent: false, reason: "email_failed" };
    return { sent: true };
  } catch {
    return { sent: false, reason: "email_failed" };
  }
}

/** Gera uma senha legível (sem caracteres ambíguos como 0/O, 1/l/I) para uso administrativo. */
export function generateReadablePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

/** Define a senha de um usuário diretamente (uso administrativo) — mesmo hash (bcrypt, 12 rounds) do resto do app. */
export async function setUserPassword(userId: string, password: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
}

export type ConfirmResetResult =
  | { ok: true }
  | { ok: false; reason: "invalid_account" | "no_code" | "expired" | "too_many_attempts" | "invalid" };

/**
 * Confere o código e, em acerto, troca a senha (bcrypt) e consome o código.
 */
export async function confirmPasswordReset(
  emailRaw: string,
  code: string,
  newPassword: string
): Promise<ConfirmResetResult> {
  const email = (emailRaw ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true }
  });
  if (!user || !user.passwordHash) return { ok: false, reason: "invalid_account" };

  const record = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" }
  });
  if (!record) return { ok: false, reason: "no_code" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const normalized = code.replace(/\D/g, "");
  if (hashCode(normalized) !== record.codeHash) {
    await prisma.passwordResetCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } }
    });
    return { ok: false, reason: "invalid" };
  }

  await prisma.$transaction([
    prisma.passwordResetCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })
  ]);
  return { ok: true };
}
