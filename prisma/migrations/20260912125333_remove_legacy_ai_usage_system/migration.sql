-- Remove o sistema legado de medição de uso de IA (AiUsageEvent + aiGenerationsPerDay).
-- O UsageLedger (modo sombra) passa a ser o único medidor; AiGenerationLog passa a cobrir
-- chat e material além de geração de questões, herdando o papel de fonte de custo/erro que
-- era do AiUsageEvent.

-- AlterTable: AiGenerationLog passa a registrar qualquer tipo de ação de IA, não só questões.
-- Backfill "QUESTION_GENERATION" para as linhas existentes (todas eram geração de questões).
ALTER TABLE "AiGenerationLog" ADD COLUMN "kind" "UsageKind" NOT NULL DEFAULT 'QUESTION_GENERATION';
ALTER TABLE "AiGenerationLog" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "AiGenerationLog" ALTER COLUMN "subjectId" DROP NOT NULL;
ALTER TABLE "AiGenerationLog" ALTER COLUMN "topicId" DROP NOT NULL;
ALTER TABLE "AiGenerationLog" ALTER COLUMN "difficulty" DROP NOT NULL;
ALTER TABLE "AiGenerationLog" ALTER COLUMN "quantity" DROP NOT NULL;

-- AlterTable: remove o teto legado de chamadas/dia, substituído pelas cotas de UsageLedger.
ALTER TABLE "SubscriptionPlan" DROP COLUMN "aiGenerationsPerDay";

-- DropTable: log bruto legado, substituído por AiGenerationLog (agora cobrindo chat/material).
DROP TABLE "AiUsageEvent";

-- DropEnum: só eram usados pela coluna/tabela acima.
DROP TYPE "AiUsageEventType";
DROP TYPE "AiUsageEventStatus";
