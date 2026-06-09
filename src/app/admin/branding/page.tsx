import { updateAppSettingsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAppSettings } from "@/lib/app-settings";

export default async function AdminBrandingPage() {
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Branding & Configurações</h1>
        <p className="text-[var(--muted-foreground)]">Controle identidade, URLs públicas e textos institucionais do SaaS.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identidade do app</CardTitle>
          <CardDescription>Use URLs internas, como /brand/logo.png, ou URLs absolutas de assets hospedados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAppSettingsAction} className="grid gap-4">
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
              <Input name="termsUrl" defaultValue={settings.termsUrl ?? ""} placeholder="URL de termos de uso" />
              <Input name="privacyUrl" defaultValue={settings.privacyUrl ?? ""} placeholder="URL de privacidade" />
            </div>
            <SubmitButton>Salvar branding</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
