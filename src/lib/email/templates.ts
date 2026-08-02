import { formatDateBR } from "@/lib/dates";

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

export function passwordResetEmailTemplate(code: string, appName: string): EmailTemplate {
  const subject = `Redefinição de senha: ${code}`;
  const body = `
    <p style="margin:0 0 16px;">Recebemos um pedido para redefinir a senha da sua conta. Use o código abaixo (válido por 15 minutos):</p>
    <p style="margin:0 0 16px;text-align:center;">
      <span style="display:inline-block;font-size:30px;font-weight:700;letter-spacing:8px;padding:14px 20px;background:#e7f1f1;color:#0a6268;border-radius:10px;">${escapeHtml(code)}</span>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px;">Se você não pediu para redefinir sua senha, ignore este e-mail — sua senha continua a mesma.</p>
  `;
  const text = `Código para redefinir sua senha em ${appName}: ${code}. Expira em 15 minutos. Se não foi você, ignore este e-mail.`;
  return { subject, html: layout(appName, body), text };
}

export function adminPasswordChangedTemplate(password: string, appName: string): EmailTemplate {
  const subject = `Sua senha foi alterada · ${appName}`;
  const body = `
    <p style="margin:0 0 16px;">Um administrador alterou a senha da sua conta em ${escapeHtml(appName)}. Sua nova senha é:</p>
    <p style="margin:0 0 16px;text-align:center;">
      <span style="display:inline-block;font-size:22px;font-weight:700;letter-spacing:2px;padding:14px 20px;background:#e7f1f1;color:#0a6268;border-radius:10px;">${escapeHtml(password)}</span>
    </p>
    <p style="margin:0 0 12px;">Recomendamos entrar e trocar essa senha por uma de sua escolha assim que possível.</p>
    <p style="margin:0;color:#64748b;font-size:13px;">Se você não esperava esta alteração, entre em contato com o suporte imediatamente.</p>
  `;
  const text = `Um administrador alterou a senha da sua conta em ${appName}. Nova senha: ${password}. Recomendamos trocá-la após entrar. Se não foi você que solicitou, contate o suporte.`;
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

export function contactNotificationTemplate(
  appName: string,
  data: { name: string; email: string; phone?: string | null; subject: string; message: string; kind: string }
): EmailTemplate {
  const isTeams = data.kind === "TEAMS";
  const subject = `${isTeams ? "[EMPRESAS] " : ""}Novo contato: ${data.subject}`;
  const body = `
    <p style="margin:0 0 12px;">Você recebeu uma nova mensagem de contato${isTeams ? " <strong>sobre planos para empresas</strong>" : ""}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 0;color:#64748b;width:90px;">Nome</td><td style="padding:4px 0;">${escapeHtml(data.name)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">E-mail</td><td style="padding:4px 0;">${escapeHtml(data.email)}</td></tr>
      ${data.phone ? `<tr><td style="padding:4px 0;color:#64748b;">Telefone</td><td style="padding:4px 0;">${escapeHtml(data.phone)}</td></tr>` : ""}
      <tr><td style="padding:4px 0;color:#64748b;">Assunto</td><td style="padding:4px 0;">${escapeHtml(data.subject)}</td></tr>
    </table>
    <p style="margin:16px 0 4px;color:#64748b;font-size:13px;">Mensagem:</p>
    <p style="margin:0;white-space:pre-wrap;">${escapeHtml(data.message)}</p>
  `;
  const text = `Novo contato${isTeams ? " (EMPRESAS)" : ""}\nNome: ${data.name}\nE-mail: ${data.email}${data.phone ? `\nTelefone: ${data.phone}` : ""}\nAssunto: ${data.subject}\n\n${data.message}`;
  return { subject, html: layout(appName, body), text };
}

export function welcomeEmailTemplate(name: string | null, appName: string): EmailTemplate {
  const firstName = (name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Olá, ${escapeHtml(firstName)}!` : "Olá!";
  const subject = `Bem-vindo(a) ao ${appName}`;
  const body = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">Sua conta no <strong>${escapeHtml(appName)}</strong> está pronta. Você já pode gerar questões, simulados e revisões com IA — comece pelo chat e peça do seu jeito.</p>
    <p style="margin:0 0 4px;">Boas dicas para começar:</p>
    <ul style="margin:0 0 12px;padding-left:18px;color:#475569;">
      <li>Peça "gere 10 questões de português sobre crase, nível difícil".</li>
      <li>Responda os blocos e deixe a IA criar revisões dos seus erros.</li>
      <li>Complete seu perfil para agilizar pagamentos via Pix.</li>
    </ul>
    <p style="margin:0;color:#64748b;font-size:13px;">Bons estudos! 🚀</p>
  `;
  const text = `${greeting}\n\nSua conta no ${appName} está pronta. Gere questões, simulados e revisões com IA pelo chat. Bons estudos!`;
  return { subject, html: layout(appName, body), text };
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function paymentReceiptTemplate(input: {
  appName: string;
  planName: string;
  amountCents: number;
  provider: "STRIPE" | "MERCADO_PAGO";
  endsAt?: Date | null;
}): EmailTemplate {
  const method = input.provider === "STRIPE" ? "Cartão de crédito" : "Pix";
  const subject = `Pagamento confirmado · ${input.appName}`;
  const body = `
    <p style="margin:0 0 12px;">Recebemos seu pagamento. Seu acesso está ativo! 🎉</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#64748b;width:120px;">Plano</td><td style="padding:6px 0;"><strong>${escapeHtml(input.planName)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Valor</td><td style="padding:6px 0;">${formatBRL(input.amountCents)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Forma</td><td style="padding:6px 0;">${method}</td></tr>
      ${input.endsAt ? `<tr><td style="padding:6px 0;color:#64748b;">Válido até</td><td style="padding:6px 0;">${formatDateBR(input.endsAt)}</td></tr>` : `<tr><td style="padding:6px 0;color:#64748b;">Renovação</td><td style="padding:6px 0;">Automática (mensal)</td></tr>`}
    </table>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Guarde este e-mail como comprovante.</p>
  `;
  const text = `Pagamento confirmado em ${input.appName}.\nPlano: ${input.planName}\nValor: ${formatBRL(input.amountCents)}\nForma: ${method}${input.endsAt ? `\nVálido até: ${formatDateBR(input.endsAt)}` : "\nRenovação automática"}`;
  return { subject, html: layout(input.appName, body), text };
}

export function subscriptionExpiringTemplate(input: {
  appName: string;
  planName: string;
  endsAt: Date;
  renewUrl: string;
}): EmailTemplate {
  const subject = `Seu acesso expira em breve · ${input.appName}`;
  const body = `
    <p style="margin:0 0 12px;">Seu acesso ao plano <strong>${escapeHtml(input.planName)}</strong> expira em <strong>${formatDateBR(input.endsAt)}</strong>.</p>
    <p style="margin:0 0 16px;">Para não perder o acesso às gerações com IA, renove agora:</p>
    <p style="margin:0 0 16px;">
      <a href="${input.renewUrl}" style="display:inline-block;background:#0a6268;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Renovar acesso</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px;">Se já renovou, ignore este e-mail.</p>
  `;
  const text = `Seu acesso ao plano ${input.planName} expira em ${formatDateBR(input.endsAt)}. Renove em: ${input.renewUrl}`;
  return { subject, html: layout(input.appName, body), text };
}

export function reviewReminderTemplate(input: {
  appName: string;
  firstName: string | null;
  dueCount: number;
  reviewUrl: string;
}): EmailTemplate {
  const greeting = input.firstName ? `Olá, ${escapeHtml(input.firstName)}!` : "Olá!";
  const countLabel =
    input.dueCount === 1 ? "1 questão esperando revisão" : `${input.dueCount} questões esperando revisão`;
  const subject = `Você tem ${input.dueCount === 1 ? "1 questão" : `${input.dueCount} questões`} para revisar hoje · ${input.appName}`;
  const body = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;">Sua agenda de revisão espaçada tem <strong>${countLabel}</strong>. Revisar no momento certo é o que fixa o conteúdo para a prova.</p>
    <p style="margin:0 0 16px;">
      <a href="${input.reviewUrl}" style="display:inline-block;background:#0a6268;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Revisar agora</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px;">Não quer mais receber este lembrete? Desative em Perfil → Preferências.</p>
  `;
  const text = `${greeting} Você tem ${countLabel} no ${input.appName}. Revise em: ${input.reviewUrl}\nPara parar de receber este lembrete, desative em Perfil → Preferências.`;
  return { subject, html: layout(input.appName, body), text };
}

export function weeklySummaryTemplate(input: {
  appName: string;
  firstName: string | null;
  weekTotal: number;
  weekAccuracy: number;
  bestSubject: { name: string; accuracy: number } | null;
  streakDays: number;
  dueReviews: number;
  reviewUrl: string;
  performanceUrl: string;
}): EmailTemplate {
  const greeting = input.firstName ? `Olá, ${escapeHtml(input.firstName)}!` : "Olá!";
  const subject = `Seu resumo da semana: ${input.weekTotal} ${input.weekTotal === 1 ? "questão" : "questões"} · ${input.weekAccuracy}% de acerto · ${input.appName}`;
  const rows = [
    `<tr><td style="padding:6px 0;color:#64748b;width:180px;">Questões na semana</td><td style="padding:6px 0;"><strong>${input.weekTotal}</strong></td></tr>`,
    `<tr><td style="padding:6px 0;color:#64748b;">Taxa de acerto</td><td style="padding:6px 0;"><strong>${input.weekAccuracy}%</strong></td></tr>`,
    input.bestSubject
      ? `<tr><td style="padding:6px 0;color:#64748b;">Melhor matéria</td><td style="padding:6px 0;">${escapeHtml(input.bestSubject.name)} (${input.bestSubject.accuracy}%)</td></tr>`
      : "",
    `<tr><td style="padding:6px 0;color:#64748b;">Sequência de dias</td><td style="padding:6px 0;">${input.streakDays} ${input.streakDays === 1 ? "dia" : "dias"}</td></tr>`,
    input.dueReviews > 0
      ? `<tr><td style="padding:6px 0;color:#64748b;">Revisões pendentes</td><td style="padding:6px 0;"><strong>${input.dueReviews}</strong></td></tr>`
      : ""
  ]
    .filter(Boolean)
    .join("");
  const cta = input.dueReviews > 0
    ? `<a href="${input.reviewUrl}" style="display:inline-block;background:#0a6268;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Revisar ${input.dueReviews} ${input.dueReviews === 1 ? "questão" : "questões"}</a>`
    : `<a href="${input.performanceUrl}" style="display:inline-block;background:#0a6268;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Ver meu desempenho</a>`;
  const body = `
    <p style="margin:0 0 12px;">${greeting} Aqui está o resumo da sua semana de estudos:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">${rows}</table>
    <p style="margin:16px 0;">${cta}</p>
    <p style="margin:0;color:#64748b;font-size:13px;">Não quer mais receber o resumo semanal? Desative em Perfil → Preferências.</p>
  `;
  const text = [
    `${greeting} Resumo da semana no ${input.appName}:`,
    `- Questões respondidas: ${input.weekTotal}`,
    `- Taxa de acerto: ${input.weekAccuracy}%`,
    input.bestSubject ? `- Melhor matéria: ${input.bestSubject.name} (${input.bestSubject.accuracy}%)` : "",
    `- Sequência de dias: ${input.streakDays}`,
    input.dueReviews > 0 ? `- Revisões pendentes: ${input.dueReviews} (${input.reviewUrl})` : "",
    `Desempenho completo: ${input.performanceUrl}`
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html: layout(input.appName, body), text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
