-- AlterTable
ALTER TABLE "AiChatSession" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summarizedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AiChatMessage" ADD COLUMN     "metadata" JSONB;
