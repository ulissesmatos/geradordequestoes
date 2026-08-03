import { updateAppSettingsAction } from "@/app/admin/admin-actions";
import { AdminTabs, type AdminTabDef } from "@/components/admin/admin-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PlanCapabilitiesFieldset } from "@/components/admin/plan-capabilities-fieldset";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAppSettings } from "@/lib/app-settings";
import { parseCapabilities } from "@/lib/capabilities";

const TABS: AdminTabDef[] = [
  { value: "identidade", label: "Identidade" },
  { value: "consumo", label: "Consumo & plano grátis" },
  { value: "legal", label: "Dados legais" },
  { value: "documentos", label: "Documentos" }
];

export default async function AdminBrandingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const activeTab =
    params.tab === "consumo" || params.tab === "legal" || params.tab === "documentos" ? params.tab : "identidade";
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Branding & Configurações" description="Controle identidade, URLs públicas e textos institucionais do SaaS." />
      <AdminTabs tabs={TABS} activeValue={activeTab} basePath="/admin/branding" />

      {activeTab === "identidade" && (
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
                <label className="grid gap-1 text-sm font-semibold">
                  Questões por bloco gerado (trial)
                  <Input
                    name="trialMaxQuestionsPerGeneration"
                    type="number"
                    min={0}
                    defaultValue={settings.trialMaxQuestionsPerGeneration}
                  />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Teto de questões em CADA geração de quem está no trial, mesmo que ele peça mais — vale no chat e no
                    formulário de gerar questões. Sem isso, uma única mensagem grátis pedindo 20 questões custa mais que um
                    dia de assinante. 0 = sem teto.
                  </span>
                </label>
              </div>
              <SubmitButton>Salvar branding</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "consumo" && (
        <div className="space-y-6">
          <Card className={settings.usageEnforcementEnabled ? undefined : "border-[var(--warning)]"}>
            <CardHeader>
              <CardTitle>Medidor de consumo</CardTitle>
              <CardDescription>
                {settings.usageEnforcementEnabled ? (
                  <>
                    <strong>Cotas valendo.</strong> Quem estourar questões/mês, questões/dia ou mensagens/dia é
                    bloqueado pelos limites configurados em Planos &amp; Pricing.
                  </>
                ) : (
                  <>
                    <strong>Modo sombra ligado.</strong> O consumo está sendo medido e aparece nos painéis, mas quem
                    bloqueia ainda é o limite antigo (gerações/dia). Deixe assim por algumas semanas, confira o
                    consumo real e ajuste as cotas em Planos &amp; Pricing — as atuais vieram de uma conversão
                    automática folgada, feita para ninguém perder acesso. Só então ligue as cotas.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form key={`usage-${settings.updatedAt.getTime()}`} action={updateAppSettingsAction} className="grid gap-3">
                {/* Par hidden+checkbox: checkbox desmarcado não é postado, então sem o hidden a
                    action não conseguiria distinguir "desliguei" de "este formulário não trata
                    do campo" — e nunca daria para voltar ao modo sombra. */}
                <input type="hidden" name="usageEnforcementSubmitted" value="1" />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    name="usageEnforcementEnabled"
                    type="checkbox"
                    defaultChecked={settings.usageEnforcementEnabled}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>
                    <span className="font-semibold">Aplicar as cotas novas (questões/mês, questões/dia, chat/dia)</span>
                    <span className="block text-xs font-normal text-[var(--muted-foreground)]">
                      Desmarcado, o app segue medindo sem bloquear ninguém. O teto de questões por bloco vale nos dois
                      casos — é regra de plano, não de consumo.
                    </span>
                  </span>
                </label>
                <SubmitButton>Salvar medidor</SubmitButton>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Funcionalidades no plano gratuito</CardTitle>
              <CardDescription>
                O que quem ainda não assinou consegue usar. Desmarcar aqui transforma a funcionalidade em argumento de
                venda — ela passa a aparecer com convite para assinar em vez de simplesmente sumir. As mesmas chaves são
                configuradas por plano pago em <strong>Planos &amp; Pricing</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form key={`trial-${settings.updatedAt.getTime()}`} action={updateAppSettingsAction} className="grid gap-4">
                <PlanCapabilitiesFieldset values={parseCapabilities(settings.trialCapabilities, "trial")} />
                <SubmitButton>Salvar plano gratuito</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "legal" && (
        <Card>
          <CardHeader>
            <CardTitle>Dados da empresa (documentos legais)</CardTitle>
            <CardDescription>
              Preenchem automaticamente os Termos de Uso e a Política de Privacidade. Campo deixado em branco faz a
              frase/seção correspondente <strong>desaparecer</strong> do documento — nada de lacuna aparecendo para o
              cliente. Preencha antes de começar a vender.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key={`legal-${settings.updatedAt.getTime()}`} action={updateAppSettingsAction} className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Razão social / nome completo
                  <Input name="legalEntityName" defaultValue={settings.legalEntityName ?? ""} placeholder="Ex.: Fulano de Tal ME" />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Quem responde legalmente pelo serviço. Em branco, usamos só o nome do app.
                  </span>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  CNPJ
                  <Input name="legalEntityCnpj" defaultValue={settings.legalEntityCnpj ?? ""} placeholder="00.000.000/0001-00" />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Deixe vazio se você opera como pessoa física.
                  </span>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  E-mail de contato/suporte
                  <Input name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ""} placeholder="contato@seudominio.com" />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Canal oficial para dúvidas, reembolso e exercício de direitos LGPD.
                  </span>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Comarca do foro
                  <Input name="legalVenueCity" defaultValue={settings.legalVenueCity ?? ""} placeholder="Ex.: Codó/MA" />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Em branco, vale só o foro do domicílio do consumidor (CDC).
                  </span>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Encarregado de dados (DPO) — nome
                  <Input name="dpoName" defaultValue={settings.dpoName ?? ""} placeholder="Nome do responsável pela LGPD" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Encarregado de dados (DPO) — e-mail
                  <Input name="dpoEmail" type="email" defaultValue={settings.dpoEmail ?? ""} placeholder="dpo@seudominio.com" />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">
                    Em branco, usamos o e-mail de suporte acima.
                  </span>
                </label>
              </div>
              <SubmitButton>Salvar dados da empresa</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "documentos" && (
        <Card>
          <CardHeader>
            <CardTitle>Documentos legais</CardTitle>
            <CardDescription>
              Conteúdo em Markdown publicado em <code className="text-xs">/termos</code> e{" "}
              <code className="text-xs">/privacidade</code>. Em branco, usamos o texto-base já preenchido com os dados da
              empresa acima — revise juridicamente antes do lançamento. Escrever aqui substitui o texto-base por completo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key={settings.updatedAt.getTime()} action={updateAppSettingsAction} className="grid gap-4">
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
      )}
    </div>
  );
}
