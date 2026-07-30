import { Prisma } from "@prisma/client";
import { BRAZIL_TIME_ZONE } from "@/lib/dates";

/**
 * Lado SQL das fronteiras de dia (o lado JS puro está em `src/lib/dates.ts`).
 *
 * Separado porque este arquivo importa o Prisma e `dates.ts` é usado também em
 * componentes client — juntar os dois arrastaria o client do Prisma para o bundle
 * do navegador.
 */

/**
 * Uma coluna de data traduzida para a hora local de Brasília, para `date_trunc` e
 * comparações de calendário dentro de $queryRaw.
 *
 * O primeiro `AT TIME ZONE 'UTC'` reinterpreta o timestamp ingênuo como UTC — é o
 * que o Prisma gravou, já que a coluna é `timestamp without time zone`. O segundo
 * converte para a hora local. Os dois passos são necessários: só o segundo trataria
 * o valor como se ele já estivesse em horário de Brasília, o que erraria em 3h.
 */
export function inBrazil(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${BRAZIL_TIME_ZONE})`;
}

/** Atalho para o caso mais comum: a coluna `"createdAt"` da tabela sendo consultada. */
export const createdAtInBrazil = inBrazil(Prisma.sql`"createdAt"`);
