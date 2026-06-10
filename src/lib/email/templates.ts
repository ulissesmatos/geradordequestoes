export type EmailTemplate = { subject: string; html: string; text: string };

function layout(appName: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f6f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1720;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 24px;background:#0a6268;color:#ffffff;font-weight:700;font-size:16px;">${escapeHtml(appName)}</td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:15px;line-height:1.6;">${bodyHtml}</td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#f4f6f6;color:#64748b;font-size:12px;">
          Você recebeu este e-mail porque há uma conta em ${escapeHtml(appName)} usando este endereço. Se não foi você, ignore esta mensagem.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmailTemplate(code: string, appName: string): EmailTemplate {
  const subject = `Seu código de verificação: ${code}`;
  const body = `
    <p style="margin:0 0 16px;">Confirme seu e-mail para proteger sua conta. Use o código abaixo (válido por 15 minutos):</p>
    <p style="margin:0 0 16px;text-align:center;">
      <span style="display:inline-block;font-size:30px;font-weight:700;letter-spacing:8px;padding:14px 20px;background:#e7f1f1;color:#0a6268;border-radius:10px;">${escapeHtml(code)}</span>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px;">Se você não solicitou este código, pode ignorar este e-mail com segurança.</p>
  `;
  const text = `Seu código de verificação em ${appName} é ${code}. Ele expira em 15 minutos. Se não foi você, ignore este e-mail.`;
  return { subject, html: layout(appName, body), text };
}

export function testEmailTemplate(appName: string): EmailTemplate {
  const subject = `Teste de e-mail · ${appName}`;
  const body = `
    <p style="margin:0 0 12px;">Este é um e-mail de teste do ${escapeHtml(appName)}.</p>
    <p style="margin:0;color:#64748b;font-size:13px;">Se você recebeu esta mensagem, o envio de e-mails está funcionando.</p>
  `;
  const text = `Teste de e-mail do ${appName}. Se você recebeu, o envio está funcionando.`;
  return { subject, html: layout(appName, body), text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
