-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyQuestionGoal" INTEGER,
ADD COLUMN     "weeklySummaryOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklySummarySentAt" TIMESTAMP(3);
