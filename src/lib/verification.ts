import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { verificationEmailTemplate } from "@/lib/email/templates";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minuto entre envios

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6 dígitos, com zeros à esquerda.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export type IssueResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "already_verified" | "cooldown"; retryInMs?: number };

/**
 * Gera um novo código de verificação, invalida os anteriores e dispara o e-mail.
 * Best-effort no envio: mesmo se o e-mail falhar, o código fica válido para
 * reenvio/digitação manual (o banner permite reenviar).
 */
export async function issueEmailVerificationCode(userId: string): Promise<IssueResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true }
  });
  if (!user) return { ok: false, reason: "already_verified" };
  if (user.emailVerified) return { ok: false, reason: "already_verified" };

  // Cooldown: evita spam de reenvio.
  const last = await prisma.emailVerificationCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryInMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }

  const code = generateCode();
  // Invalida códigos anteriores não consumidos e cria o novo.
  await prisma.emailVerificationCode.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() }
  });
  await prisma.emailVerificationCode.create({
    data: {
      userId,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS)
    }
  });

  const appSettings = await getAppSettings();
  const template = verificationEmailTemplate(code, appSettings.appName);
  const result = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text
  });

  return { ok: true, emailSent: result.ok };
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; reason: "already_verified" | "no_code" | "expired" | "too_many_attempts" | "invalid" };

/**
 * Confere o código vigente. Em acerto, marca o usuário como verificado e
 * consome o código; em erro, incrementa o contador de tentativas.
 */
export async function confirmEmailVerificationCode(userId: string, code: string): Promise<ConfirmResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user) return { ok: false, reason: "no_code" };
  if (user.emailVerified) return { ok: true };

  const record = await prisma.emailVerificationCode.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: "desc" }
  });
  if (!record) return { ok: false, reason: "no_code" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const normalized = code.replace(/\D/g, "");
  if (hashCode(normalized) !== record.codeHash) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } }
    });
    return { ok: false, reason: "invalid" };
  }

  await prisma.$transaction([
    prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } })
  ]);
  return { ok: true };
}
