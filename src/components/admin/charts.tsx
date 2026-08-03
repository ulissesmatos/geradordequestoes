"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Paleta categórica validada com scripts/validate_palette.js da skill de dataviz, contra as
 * superfícies reais do app (#ffffff claro / #161d1b escuro) — passa em todos os checks (banda
 * de luminosidade, piso de croma, separação CVD ≥8, piso de visão normal ≥15, contraste ≥3:1)
 * nos dois modos e em --pairs all. NÃO adicione uma 4ª cor sem revalidar: um violeta testado
 * ficou a ΔE 1.7 do azul (falhou). Além de 3 séries, agrupe em "Outros" (GRAY) em vez de gerar
 * uma cor nova — é a orientação da skill pra esse caso.
 */
export const CHART_COLORS = {
  teal: "#0d9488",
  gold: "#c58200",
  blue: "#2a78d6",
  rose: "#f43f5e",
  gray: "#8b9490"
} as const;

const GRID_COLOR = "var(--border)";
const AXIS_COLOR = "var(--muted-foreground)";
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)"
};

export type ChartSeries = { key: string; label: string; color: string };

/**
 * String, não função: Server Components não podem passar funções pra Client Components (não
 * serializável pelo RSC, exceto Server Action) — por isso o formato é escolhido por um
 * identificador, e a formatação de verdade mora aqui dentro, do lado client.
 */
export type ChartValueFormat = "brl" | "usd" | "number";

function formatChartValue(value: number, format?: ChartValueFormat): string {
  if (format === "brl") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  if (format === "usd") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
  return new Intl.NumberFormat("pt-BR").format(value);
}

type ChartProps = {
  data: Record<string, string | number>[];
  xKey: string;
  series: ChartSeries[];
  valueFormat?: ChartValueFormat;
  height?: number;
};

/** Série temporal (MRR, custo de IA, churn ao longo do tempo) — nunca pizza/donut para isso. */
export function TrendLineChart({ data, xKey, series, valueFormat, height = 280 }: ChartProps) {
  const format = (value: number) => formatChartValue(value, valueFormat);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} width={70} tickFormatter={format} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          formatter={(value) => format(Number(value))}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Comparação categórica (receita por plano, distribuição de assinantes, custo por modelo).
 *
 * `colorByCategory: true` pinta CADA barra com uma cor da paleta (ciclando por índice) em vez
 * de uma cor só para a série inteira — uso certo quando cada barra É a categoria (ex.: um
 * plano, um modelo), não quando várias barras formam uma mesma série comparada lado a lado.
 * Só vale com series.length === 1; a legenda vira supérflua (o rótulo do eixo já identifica a
 * categoria — "seleção de rótulos diretos" em vez de caixa de legenda, ver skill de dataviz).
 */
export function CategoryBarChart({
  data,
  xKey,
  series,
  valueFormat,
  height = 280,
  colorByCategory = false
}: ChartProps & { colorByCategory?: boolean }) {
  const format = (value: number) => formatChartValue(value, valueFormat);
  const palette = [CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.blue, CHART_COLORS.gray];
  const useCells = colorByCategory && series.length === 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} width={70} tickFormatter={format} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--surface-subtle)" }} formatter={(value) => format(Number(value))} />
        {!useCells && series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={48}>
            {useCells && data.map((_, index) => <Cell key={index} fill={palette[index % palette.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
