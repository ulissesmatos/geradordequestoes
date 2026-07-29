import { updateAppSettingsAction } from "@/app/admin/admin-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAppSettings } from "@/lib/app-settings";

export default async function AdminBrandingPage() {
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Branding & Configurações" description="Controle identidade, URLs públicas e textos institucionais do SaaS." />

      <Card>
        <CardHeader>
          <CardTitle>Identidade do app</CardTitle>
          <CardDescription>Use URLs internas, como /brand/logo.png, ou URLs absolutas de assets hospedados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form key={settings.updatedAt.getTime()} action={updateAppSettingsAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="appName" defaultValue={settings.appName} placeholder="Nome do app" required />
              <Input name="publicUrl" defaultValue={settings.publicUrl ?? ""} placeholder="URL pública, ex.: https://www.geradordequestoes.site" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="logoUrl" defaultValue={settings.logoUrl} placeholder="/brand/logo.png" required />
              <Input name="faviconUrl" defaultValue={settings.faviconUrl} placeholder="/brand/favicon.png" required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Cor primária
                <Input name="primaryColor" type="color" defaultValue={settings.primaryColor} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Cor de destaque
                <Input name="accentColor" type="color" defaultValue={settings.accentColor} />
              </label>
            </div>
            <Textarea name="institutionalText" defaultValue={settings.institutionalText} placeholder="Texto institucional curto" />
            <Textarea name="adminEmails" defaultValue={settings.adminEmails} placeholder="E-mails administrativos, um por linha ou separados por vírgula" />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Mensagens/gerações grátis por mês (trial)
                <Input name="trialGenerationsLimit" type="number" min={0} defaultValue={settings.trialGenerationsLimit} />
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  Quantas mensagens de chat ou gerações de IA um usuário sem assinatura pode fazer por mês. Reseta todo dia 1º.
                </span>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Respostas/dia no banco (trial)
                <Input name="bankDailyAnswersLimitTrial" type="number" min={0} defaultValue={settings.bankDailyAnswersLimitTrial} />
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  Quantas questões do banco público um usuário sem assinatura pode responder por dia.
                </span>
              </label>
            </div>
            <SubmitButton>Salvar branding</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Documentos legais ── */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos legais</CardTitle>
          <CardDescription>
            Conteúdo em Markdown publicado em <code className="text-xs">/termos</code> e{" "}
            <code className="text-xs">/privacidade</code>. Em branco, usamos um texto-base; preencha e revise
            juridicamente antes do lançamento. (Os campos de URL acima funcionam como redirecionamento alternativo.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={settings.updatedAt.getTime()} action={updateAppSettingsAction} className="grid gap-4">
            {/* Reenvia os demais campos do AppSetting para a action não sobrescrevê-los. */}
            <input type="hidden" name="appName" value={settings.appName} />
            <input type="hidden" name="logoUrl" value={settings.logoUrl} />
            <input type="hidden" name="faviconUrl" value={settings.faviconUrl} />
            <input type="hidden" name="primaryColor" value={settings.primaryColor} />
            <input type="hidden" name="accentColor" value={settings.accentColor} />
            <input type="hidden" name="publicUrl" value={settings.publicUrl ?? ""} />
            <input type="hidden" name="adminEmails" value={settings.adminEmails} />
            <input type="hidden" name="institutionalText" value={settings.institutionalText} />
            <input type="hidden" name="termsUrl" value={settings.termsUrl ?? ""} />
            <input type="hidden" name="privacyUrl" value={settings.privacyUrl ?? ""} />
            <input type="hidden" name="trialGenerationsLimit" value={settings.trialGenerationsLimit} />
            <input type="hidden" name="bankDailyAnswersLimitTrial" value={settings.bankDailyAnswersLimitTrial} />

            <label className="grid gap-1 text-sm font-semibold">
              Termos de Uso (Markdown)
              <Textarea name="termsContent" rows={10} defaultValue={settings.termsContent ?? ""} placeholder="# Termos de Uso&#10;..." className="font-mono text-xs" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Política de Privacidade (Markdown)
              <Textarea name="privacyContent" rows={10} defaultValue={settings.privacyContent ?? ""} placeholder="# Política de Privacidade&#10;..." className="font-mono text-xs" />
            </label>
            <SubmitButton>Salvar documentos</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
