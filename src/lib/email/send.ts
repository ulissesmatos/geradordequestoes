import { EmailProvider } from "@prisma/client";
import { getEmailSettings, type EmailSettings } from "@/lib/email/settings";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped?: false; error: string };

/**
 * Envia um e-mail pelo provedor configurado no admin. Degradação segura:
 * se não houver configuração válida, retorna { ok:false, skipped:true } sem
 * lançar — nenhum fluxo (signup, verificação) quebra por causa de e-mail.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  let settings: EmailSettings;
  try {
    settings = await getEmailSettings();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao ler configuração de e-mail." };
  }

  if (!settings.enabled || !settings.apiKey || !settings.fromEmail) {
    return { ok: false, skipped: true };
  }

  try {
    if (settings.provider === EmailProvider.RESEND) {
      return await sendViaResend(settings, input);
    }
    return await sendViaBrevo(settings, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao enviar e-mail." };
  }
}

async function sendViaBrevo(settings: EmailSettings, input: SendEmailInput): Promise<SendEmailResult> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": settings.apiKey as string,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      sender: { email: settings.fromEmail, name: settings.fromName ?? settings.fromEmail },
      to: [{ email: input.to }],
      ...(settings.replyTo ? { replyTo: { email: settings.replyTo } } : {}),
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text ?? stripHtml(input.html)
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `Brevo ${response.status}: ${body.slice(0, 300)}` };
  }
  return { ok: true };
}

async function sendViaResend(settings: EmailSettings, input: SendEmailInput): Promise<SendEmailResult> {
  const from = settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : (settings.fromEmail as string);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html)
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 300)}` };
  }
  return { ok: true };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
