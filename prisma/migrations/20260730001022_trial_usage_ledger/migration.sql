-- CreateEnum
CREATE TYPE "TrialUsageKind" AS ENUM ('CHAT_MESSAGE', 'QUESTION_GENERATION', 'MATERIAL_EXPAND');

-- CreateTable
CREATE TABLE "TrialUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TrialUsageKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialUsageEvent_userId_createdAt_idx" ON "TrialUsageEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrialUsageEvent" ADD CONSTRAINT "TrialUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
