-- AlterTable
ALTER TABLE "AiProviderSetting" ADD COLUMN     "premiumInputPricePerMillionUsd" DECIMAL(10,4),
ADD COLUMN     "premiumModel" TEXT,
ADD COLUMN     "premiumOutputPricePerMillionUsd" DECIMAL(10,4);
