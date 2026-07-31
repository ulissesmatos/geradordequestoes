import { Input } from "@/components/ui/input";

/**
 * Cotas vendidas do plano. São colunas de verdade (não capabilities): o admin mexe nelas
 * toda semana e elas entram em relatório e comparação entre planos.
 *
 * Campo vazio = ilimitado. É o que faz um plano "sem teto" ser expressável sem número mágico.
 */
export function PlanQuotaFields({
  values
}: {
  values?: {
    questionsPerMonth: number | null;
    questionsPerDay: number | null;
    maxQuestionsPerGeneration: number | null;
    chatMessagesPerDay: number | null;
  };
}) {
  return (
    <fieldset className="rounded-md border border-[var(--border)] p-3">
      <legend className="px-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
        Cotas do plano
      </legend>
      <p className="mb-3 text-xs text-[var(--muted-foreground)]">
        Deixe em branco para <strong>ilimitado</strong>. Os valores atuais vieram de uma conversão automática do
        limite antigo, deliberadamente folgada para ninguém perder acesso — ajuste-os depois de observar o consumo
        real com o medidor em modo sombra (Admin → Branding).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          Questões por mês
          <Input
            name="questionsPerMonth"
            type="number"
            min={0}
            defaultValue={values?.questionsPerMonth ?? ""}
            placeholder="ilimitado"
          />
          <span className="text-xs font-normal text-[var(--muted-foreground)]">
            A cota principal — é este número que o card de preço vende. Renova no aniversário da assinatura.
          </span>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Questões por dia
          <Input
            name="questionsPerDay"
            type="number"
            min={0}
            defaultValue={values?.questionsPerDay ?? ""}
            placeholder="ilimitado"
          />
          <span className="text-xs font-normal text-[var(--muted-foreground)]">
            Rajada: impede queimar o mês inteiro (e o custo de API) num dia só, e dá motivo para voltar amanhã.
          </span>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Questões por bloco gerado
          <Input
            name="maxQuestionsPerGeneration"
            type="number"
            min={0}
            defaultValue={values?.maxQuestionsPerGeneration ?? ""}
            placeholder="sem teto"
          />
          <span className="text-xs font-normal text-[var(--muted-foreground)]">
            Tamanho máximo de CADA bloco. É o diferencial mais direto entre planos: quem paga mais gera blocos
            maiores de uma vez.
          </span>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Mensagens de chat por dia
          <Input
            name="chatMessagesPerDay"
            type="number"
            min={0}
            defaultValue={values?.chatMessagesPerDay ?? ""}
            placeholder="ilimitado"
          />
          <span className="text-xs font-normal text-[var(--muted-foreground)]">
            Conversar é barato perto de gerar questão — seja generoso aqui. Materiais também contam neste medidor.
          </span>
        </label>
      </div>
    </fieldset>
  );
}
