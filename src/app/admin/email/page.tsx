import { sendTestEmailAction, updateEmailSettingsAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SecretInput } from "@/components/admin/secret-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { maskSecret } from "@/lib/crypto";

export default async function AdminEmailPage() {
  const settings = await prisma.emailSetting.findUnique({ where: { id: "default" } });
  const apiKeyMasked = maskSecret(settings?.apiKey ?? null);
  const provider = settings?.provider ?? "BREVO";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="E-mail"
        description="Configure o envio de e-mails (verificação de conta e comunicados). A chave deixada em branco mantém a atual."
      />

      <form key={settings?.updatedAt.getTime() ?? "new"} action={updateEmailSettingsAction} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Provedor de envio</CardTitle>
            <CardDescription>
              Brevo funciona sem configurar DNS (basta verificar o remetente único no painel Brevo). Resend exige domínio
              verificado para enviar a destinatários quaisquer.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Provedor</label>
              <select
                name="provider"
                defaultValue={provider}
                className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="BREVO">Brevo</option>
                <option value="RESEND">Resend</option>
              </select>
            </div>

            <SecretInput
              name="apiKey"
              label="API key"
              masked={apiKeyMasked}
              placeholder="xkeysib-... (Brevo) ou re_... (Resend)"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium">E-mail remetente</label>
              <Input name="fromEmail" type="email" placeholder="contato@seudominio.com" defaultValue={settings?.fromEmail ?? ""} />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">No Brevo, este endereço precisa estar verificado.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Nome do remetente</label>
              <Input name="fromName" placeholder="Gerador de Questões" defaultValue={settings?.fromName ?? ""} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Responder para (opcional)</label>
              <Input name="replyTo" type="email" placeholder="suporte@seudominio.com" defaultValue={settings?.replyTo ?? ""} />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} className="h-4 w-4" />
                Envio de e-mails ativado
              </label>
            </div>
          </CardContent>
        </Card>

        <SubmitButton>Salvar configuração</SubmitButton>
      </form>

      {/* ── Teste de envio ── */}
      <Card>
        <CardHeader>
          <CardTitle>Enviar e-mail de teste</CardTitle>
          <CardDescription>
            Envia uma mensagem de teste com a configuração salva. {settings?.enabled ? "" : "Ative o envio acima primeiro."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendTestEmailAction} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="mb-1.5 block text-sm font-medium">Destinatário</label>
              <Input name="to" type="email" placeholder="seu-email@exemplo.com" />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Em branco, envia para o seu e-mail de admin.</p>
            </div>
            <SubmitButton>Enviar teste</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
