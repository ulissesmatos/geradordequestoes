-- CreateEnum
CREATE TYPE "UsageMeter" AS ENUM ('QUESTIONS', 'CHAT');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('CHAT_MESSAGE', 'QUESTION_GENERATION', 'MATERIAL_GENERATION', 'MATERIAL_EXPAND');

-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meter" "UsageMeter" NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "costUnits" INTEGER NOT NULL DEFAULT 1,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageLedger_userId_meter_createdAt_idx" ON "UsageLedger"("userId", "meter", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "questionsPerMonth" INTEGER,
  ADD COLUMN "questionsPerDay" INTEGER,
  ADD COLUMN "maxQuestionsPerGeneration" INTEGER,
  ADD COLUMN "chatMessagesPerDay" INTEGER;

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN "limitsOverride" JSONB;

-- AlterTable
ALTER TABLE "AppSetting"
  ADD COLUMN "trialQuestionsPerMonth" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "usageEnforcementEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill das cotas a partir do limite antigo, SEMPRE PARA CIMA.
-- aiGenerationsPerDay contava chamadas, e cada chamada podia gerar até 15 questões; o piso
-- mensal usa 15x o limite diário x 30 dias para garantir que nenhum assinante ativo perca
-- acesso ao que já conseguia fazer. Os números finais devem ser ajustados no painel depois
-- de observar o consumo real com o modo sombra ligado.
UPDATE "SubscriptionPlan"
SET
  "questionsPerMonth" = "aiGenerationsPerDay" * 15 * 30,
  "questionsPerDay" = "aiGenerationsPerDay" * 15,
  "chatMessagesPerDay" = GREATEST("aiGenerationsPerDay", 20)
WHERE "questionsPerMonth" IS NULL;

-- Backfill do livro-caixa: preserva o consumo do trial já registrado, para quem estiver no
-- meio do mês não ganhar cota nova por causa da migração.
INSERT INTO "UsageLedger" ("id", "userId", "meter", "kind", "costUnits", "createdAt")
SELECT
  "id",
  "userId",
  CASE WHEN "kind" = 'QUESTION_GENERATION' THEN 'QUESTIONS'::"UsageMeter" ELSE 'CHAT'::"UsageMeter" END,
  CASE
    WHEN "kind" = 'QUESTION_GENERATION' THEN 'QUESTION_GENERATION'::"UsageKind"
    WHEN "kind" = 'MATERIAL_EXPAND' THEN 'MATERIAL_EXPAND'::"UsageKind"
    ELSE 'CHAT_MESSAGE'::"UsageKind"
  END,
  1,
  "createdAt"
FROM "TrialUsageEvent";
