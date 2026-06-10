"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcrypt";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { confirmEmailVerificationCode, issueEmailVerificationCode } from "@/lib/verification";

const registerSchema = z.object({
  name: z.string().min(2, "Informe seu nome."),
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(8, "Use pelo menos 8 caracteres.")
});

export async function loginAction(_: unknown, formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/ai"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha inválidos, ou usuário bloqueado." };
    }
    throw error;
  }
}

export async function registerAction(_: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase(),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { error: "Este e-mail já está cadastrado." };

  const created = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12)
    }
  });

  // Dispara o código de verificação antes do signIn (que redireciona).
  // Best-effort: falha de e-mail nunca impede o cadastro.
  try {
    await issueEmailVerificationCode(created.id);
  } catch {
    // ignora — o banner permitirá reenviar
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/ai"
  });
}

export async function requestEmailCodeAction(): Promise<{ ok: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Sessão expirada." };
  try {
    const result = await issueEmailVerificationCode(session.user.id);
    if (result.ok) return { ok: true };
    if (result.reason === "already_verified") return { ok: false, message: "Seu e-mail já está verificado." };
    if (result.reason === "cooldown") {
      const seconds = Math.ceil((result.retryInMs ?? 0) / 1000);
      return { ok: false, message: `Aguarde ${seconds}s para reenviar.` };
    }
    return { ok: false, message: "Não foi possível enviar o código." };
  } catch {
    return { ok: false, message: "Não foi possível enviar o código." };
  }
}

export async function verifyEmailCodeAction(_: unknown, formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Sessão expirada." };
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, message: "Digite os 6 dígitos do código." };

  const result = await confirmEmailVerificationCode(session.user.id, code);
  if (result.ok) return { ok: true };
  const messages: Record<string, string> = {
    already_verified: "Seu e-mail já está verificado.",
    no_code: "Nenhum código ativo. Reenvie um novo.",
    expired: "Código expirado. Reenvie um novo.",
    too_many_attempts: "Muitas tentativas. Reenvie um novo código.",
    invalid: "Código incorreto. Verifique e tente novamente."
  };
  return { ok: false, message: messages[result.reason] ?? "Código inválido." };
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/ai" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
