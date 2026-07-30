-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "trialMaxQuestionsPerGeneration" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "countsAsRevenue" BOOLEAN NOT NULL DEFAULT true;

-- Transações MANUAL nunca foram dinheiro entrando (cortesia/assinatura liberada no painel):
-- saem do caixa retroativamente para o total de receita parar de mentir.
UPDATE "PaymentTransaction" SET "countsAsRevenue" = false WHERE "provider" = 'MANUAL';
