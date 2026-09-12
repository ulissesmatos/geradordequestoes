import { UsageKind, UsageMeter } from "@prisma/client";
import { CHART_COLORS, TrendLineChart } from "@/components/admin/charts";
import { StatTile } from "@/components/performance-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, quotaTone } from "@/components/ui/progress";
import { dayKeyToInstant, formatDateTimeBR, formatDayMonthBR } from "@/lib/dates";
import type { MeterReport, UserUsageReport } from "@/lib/usage/report";

/**
 * Consumo de UM usuário, do ponto de vista do admin.
 *
 * Mostra os números mesmo em modo sombra — é justamente aí que eles servem para alguma coisa,
 * porque é a medição real que diz se as cotas configuradas fazem sentido antes de passarem a
 * bloquear alguém. Por isso as barras de cota aparecem rotuladas como hipótese ("cota valeria")
 * enquanto o enforcement está desligado, em vez de sumirem.
 */

const KIND_LABEL: Record<UsageKind, string> = {
  [UsageKind.CHAT_MESSAGE]: "Mensagem de chat",
  [UsageKind.QUESTION_GENERATION]: "Geração de questões",
  [UsageKind.MATERIAL_GENERATION]: "Material de estudo",
  [UsageKind.MATERIAL_EXPAND]: "Aprofundar material"
};

const PLAN_KIND_LABEL: Record<UserUsageReport["limits"]["kind"], string> = {
  ADMIN: "Admin (sem cota)",
  PAID: "Assinante",
  TRIAL: "Trial / plano gratuito"
};

function num(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
}

export function UserUsagePanel({ report }: { report: UserUsageReport }) {
  const { limits } = report;
  const enforcement = limits.enforcement;
  const isAdmin = limits.kind === "ADMIN";

  const chartData = report.daily.map((point) => ({
    dia: formatDayMonthBR(dayKeyToInstant(point.day)),
    questoes: point.questions,
    acoes: point.chat
  }));
  const hasMovement = report.daily.some((point) => point.questions > 0 || point.chat > 0);

  return (
    <div className="space-y-6">
      <Card className={enforcement ? undefined : "border-[var(--warning)]"}>
        <CardHeader>
          <CardTitle>Consumo medido</CardTitle>
          <CardDescription>
            {enforcement ? (
              <>
                <strong>Cotas valendo.</strong> Os números abaixo são os mesmos que bloqueiam este usuário quando
                estouram.
              </>
            ) : (
              <>
                <strong>Modo sombra.</strong> O consumo é real e está sendo registrado, mas nenhuma cota bloqueia
                ninguém ainda. As barras de cota abaixo mostram o que <em>aconteceria</em> se você ligasse o medidor
                em Branding → Consumo.
              </>
            )}{" "}
            Conta: <strong>{PLAN_KIND_LABEL[limits.kind]}</strong>. Ciclo atual de{" "}
            {formatDateTimeBR(limits.period.start)} a {formatDateTimeBR(limits.period.end)} (
            {limits.period.anchor === "ANIVERSARIO" ? "aniversário da assinatura" : "mês calendário"}).
          </CardDescription>
        </CardHeader>
      </Card>

      <MeterSection
        title="Questões geradas"
        description="Uma unidade por questão entregue — a reserva é feita pelo tamanho do bloco pedido e acertada para baixo quando o modelo devolve menos."
        meter={report.questions}
        enforcement={enforcement}
        isAdmin={isAdmin}
      />

      <MeterSection
        title="Ações de IA (chat e materiais)"
        description="Uma unidade por ação de entrada: mensagem no chat, material novo, aprofundar seção. Geração de questões não entra aqui — tem medidor próprio."
        meter={report.chat}
        enforcement={enforcement}
        isAdmin={isAdmin}
      />

      <Card>
        <CardHeader>
          <CardTitle>Últimos 30 dias</CardTitle>
          <CardDescription>Consumo por dia, no corte de Brasília — o mesmo que o app usa para virar o dia.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasMovement ? (
            <TrendLineChart
              data={chartData}
              xKey="dia"
              series={[
                { key: "questoes", label: "Questões", color: CHART_COLORS.teal },
                { key: "acoes", label: "Ações de IA", color: CHART_COLORS.gold }
              ]}
              height={240}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum consumo registrado nos últimos 30 dias.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custo real de IA</CardTitle>
          <CardDescription>
            Tokens e custo cobrados pelo provedor, de todas as chamadas deste usuário. Hoje só a geração de questões
            grava valor — chat e material aparecem na contagem de chamadas, mas ainda entram como custo zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile value={formatUsd(report.ai.costUsd)} label="Custo total" />
          <StatTile
            value={num(report.ai.inputTokens + report.ai.outputTokens)}
            label="Tokens"
            hint={`${num(report.ai.inputTokens)} entrada · ${num(report.ai.outputTokens)} saída`}
          />
          <StatTile value={num(report.ai.events)} label="Chamadas de IA" hint={`${num(report.ai.eventsToday)} hoje`} />
          <StatTile
            value={num(report.ai.errors)}
            label="Chamadas com erro"
            tone={report.ai.errors > 0 ? "negative" : "neutral"}
          />
        </CardContent>
      </Card>

    </div>
  );
}

function MeterSection({
  title,
  description,
  meter,
  enforcement,
  isAdmin
}: {
  title: string;
  description: string;
  meter: MeterReport;
  enforcement: boolean;
  isAdmin: boolean;
}) {
  const unit = meter.meter === UsageMeter.QUESTIONS ? "questões" : "ações";
  const hasQuota = meter.limits.perMonth !== null || meter.limits.perDay !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile value={num(meter.buckets.today)} label="Hoje" />
          <StatTile value={num(meter.buckets.cycle)} label="Ciclo atual" hint={`${num(meter.buckets.month)} no mês calendário`} />
          <StatTile value={num(meter.buckets.last30)} label="Últimos 30 dias" />
          <StatTile
            value={num(meter.buckets.total)}
            label="Total histórico"
            hint={meter.refunded > 0 ? `${num(meter.refunded)} ${unit} estornadas (não contam)` : undefined}
          />
        </div>

        {isAdmin ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Conta de admin: nada é cobrado no livro-caixa, então os números acima ficam zerados por construção.
          </p>
        ) : hasQuota ? (
          <div className="space-y-3">
            <QuotaBar
              label={enforcement ? "Cota do ciclo" : "Cota do ciclo (não está bloqueando)"}
              used={meter.buckets.cycle}
              limit={meter.limits.perMonth}
              percent={meter.percentCycle}
            />
            <QuotaBar
              label={enforcement ? "Cota de hoje" : "Cota de hoje (não está bloqueando)"}
              used={meter.buckets.today}
              limit={meter.limits.perDay}
              percent={meter.percentToday}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Sem teto configurado para este medidor no plano atual.</p>
        )}

        {meter.byKind.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2">Tipo de ação</th>
                  <th className="text-right">Unidades</th>
                  <th className="text-right">Ocorrências</th>
                  <th className="text-right">Média</th>
                </tr>
              </thead>
              <tbody>
                {meter.byKind.map((row) => (
                  <tr key={row.kind} className="border-t border-[var(--border)]">
                    <td className="py-2">{KIND_LABEL[row.kind]}</td>
                    <td className="text-right tabular-nums">{num(row.units)}</td>
                    <td className="text-right tabular-nums">{num(row.events)}</td>
                    <td className="text-right tabular-nums">
                      {row.events > 0 ? (row.units / row.events).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  percent
}: {
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
}) {
  if (limit === null || percent === null) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[var(--muted-foreground)]">{label}</span>
        <span className="tabular-nums">
          <strong>{num(used)}</strong> de {num(limit)} · {percent}%
        </span>
      </div>
      <Progress className="mt-1.5" value={used} total={limit} tone={quotaTone(percent)} label={`${label}: ${used} de ${limit}`} />
    </div>
  );
}
