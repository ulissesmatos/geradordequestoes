-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "bankDailyAnswersLimitTrial" INTEGER NOT NULL DEFAULT 10;

-- CreateIndex
CREATE INDEX "Question_status_subjectId_topicId_idx" ON "Question"("status", "subjectId", "topicId");

-- CreateIndex
CREATE INDEX "Question_status_createdAt_idx" ON "Question"("status", "createdAt");
