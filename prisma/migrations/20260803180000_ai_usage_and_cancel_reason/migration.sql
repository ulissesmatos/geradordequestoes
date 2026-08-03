-- CreateEnum
CREATE TYPE "SubscriptionCancelReason" AS ENUM ('VOLUNTARY', 'PAYMENT_FAILED', 'ADMIN', 'TEAM', 'SUPERSEDED');

-- AlterTable: AiProviderSetting — preço por token do modelo atualmente configurado
ALTER TABLE "AiProviderSetting"
  ADD COLUMN "inputPricePerMillionUsd" DECIMAL(10,4),
  ADD COLUMN "outputPricePerMillionUsd" DECIMAL(10,4);

-- DropForeignKey: AiGenerationLog.adminId -> renomeado para userId (recebe id de qualquer usuário, não só admin)
ALTER TABLE "AiGenerationLog" DROP CONSTRAINT "AiGenerationLog_adminId_fkey";

-- AlterTable: AiGenerationLog — rename + campos novos de uso/custo
ALTER TABLE "AiGenerationLog" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "AiGenerationLog"
  ADD COLUMN "userPrompt" TEXT,
  ADD COLUMN "responseText" TEXT,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "costUsd" DECIMAL(10,6);

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: AiUsageEvent — campos numéricos de uso/custo (fonte de custo agregado)
ALTER TABLE "AiUsageEvent"
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "costUsd" DECIMAL(10,6);

-- AlterTable: UserSubscription — motivo de cancelamento (null = anterior a esta migração)
ALTER TABLE "UserSubscription" ADD COLUMN "cancelReason" "SubscriptionCancelReason";
