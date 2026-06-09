-- CreateEnum
CREATE TYPE "AiChatPresetUsageLevel" AS ENUM ('NENHUM', 'POUCO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "AiUsageEventType" AS ENUM ('CHAT_RESPONSE', 'QUESTION_GENERATION');

-- CreateEnum
CREATE TYPE "AiUsageEventStatus" AS ENUM ('SUCCESS', 'ERROR');

-- AlterTable
ALTER TABLE "AiProviderSetting" ADD COLUMN     "chatPresetUsageLevel" "AiChatPresetUsageLevel" NOT NULL DEFAULT 'MEDIO';

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AiUsageEventType" NOT NULL,
    "status" "AiUsageEventStatus" NOT NULL DEFAULT 'SUCCESS',
    "model" TEXT,
    "prompt" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
