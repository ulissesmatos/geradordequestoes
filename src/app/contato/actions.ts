"use server";

import { ContactMessageKind } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { contactNotificationTemplate } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

export type ContactActionState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  name: z.string().min(2, "Informe seu nome."),
  email: z.string().email("Informe um e-mail válido."),
  phone: z.string().optional(),
  subject: z.string().min(2, "Informe o assunto."),
  message: z.string().min(10, "Escreva uma mensagem com mais detalhes.")
});

function firstAdminEmail(adminEmails: string | null | undefined): string | null {
  if (!adminEmails) return null;
  const list = adminEmails.split(/[,\n;]/).map((e) => e.trim()).filter(Boolean);
  return list[0] ?? null;
}

export async function submitContactAction(_: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    subject: String(formData.get("subject") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim()
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const kind = formData.get("teams") === "on" ? ContactMessageKind.TEAMS : ContactMessageKind.GENERAL;
  const session = await auth();

  const data = { ...parsed.data, phone: parsed.data.phone ?? null, kind };

  await prisma.contactMessage.create({
    data: { ...data, userId: session?.user?.id ?? null }
  });

  // Notifica o admin (best-effort — falha de e-mail não quebra o envio).
  try {
    const appSettings = await getAppSettings();
    const to = firstAdminEmail(appSettings.adminEmails);
    if (to) {
      const template = contactNotificationTemplate(appSettings.appName, data);
      await sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
    }
  } catch {
    // ignora
  }

  return { ok: true };
}
